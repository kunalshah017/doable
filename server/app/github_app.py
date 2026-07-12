import asyncio
import base64
import binascii
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
import jwt


GITHUB_API_VERSION = "2022-11-28"
GITHUB_API_URL = "https://api.github.com"


class GitHubConfigurationError(Exception):
    pass


class InvalidGitHubState(Exception):
    pass


class GitHubAPIError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class GitHubAppConfig:
    app_id: str | None
    slug: str | None
    private_key_path: str | None
    callback_url: str
    state_secret: str | None

    @classmethod
    def from_env(cls) -> "GitHubAppConfig":
        return cls(
            app_id=os.getenv("GITHUB_APP_ID"),
            slug=os.getenv("GITHUB_APP_SLUG"),
            private_key_path=os.getenv("GITHUB_APP_PRIVATE_KEY_PATH"),
            callback_url=os.getenv(
                "GITHUB_APP_CALLBACK_URL",
                "http://127.0.0.1:8787/v1/github/callback",
            ),
            state_secret=os.getenv("GITHUB_STATE_SECRET"),
        )


@dataclass(slots=True)
class _CachedToken:
    value: str
    usable_until: datetime


class GitHubApp:
    def __init__(
        self,
        config: GitHubAppConfig | None = None,
        client: httpx.AsyncClient | None = None,
        api_url: str = GITHUB_API_URL,
    ) -> None:
        self.config = config or GitHubAppConfig.from_env()
        self._client = client
        self._api_url = api_url.rstrip("/")
        self._tokens: dict[tuple[int, int | None], _CachedToken] = {}
        self._token_lock = asyncio.Lock()

    def status(self) -> tuple[bool, str | None]:
        required = {
            "GITHUB_APP_ID": self.config.app_id,
            "GITHUB_APP_SLUG": self.config.slug,
            "GITHUB_APP_PRIVATE_KEY_PATH": self.config.private_key_path,
            "GITHUB_STATE_SECRET": self.config.state_secret,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            return False, f"GitHub App is not configured: missing {', '.join(missing)}"
        if not Path(self.config.private_key_path or "").is_file():
            return False, "GitHub App private key is unavailable"
        return True, None

    def installation_url(self, session_id: str) -> str:
        self._require_configured()
        state = self.sign_state(session_id)
        return (
            f"https://github.com/apps/{self.config.slug}/installations/new?"
            f"{urlencode({'state': state})}"
        )

    def sign_state(self, session_id: str, lifetime_seconds: int = 600) -> str:
        self._require_configured()
        payload = json.dumps(
            {"exp": int(time.time()) + lifetime_seconds, "sessionId": session_id},
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        encoded = self._base64url(payload)
        signature = hmac.new(
            (self.config.state_secret or "").encode("utf-8"),
            encoded.encode("ascii"),
            hashlib.sha256,
        ).digest()
        return f"{encoded}.{self._base64url(signature)}"

    def verify_state(self, state: str) -> str:
        self._require_configured()
        try:
            encoded, supplied_signature = state.split(".", 1)
            expected_signature = hmac.new(
                (self.config.state_secret or "").encode("utf-8"),
                encoded.encode("ascii"),
                hashlib.sha256,
            ).digest()
            if not hmac.compare_digest(
                self._base64url(expected_signature), supplied_signature
            ):
                raise InvalidGitHubState
            payload = json.loads(self._decode_base64url(encoded))
            session_id = payload["sessionId"]
            expires_at = int(payload["exp"])
        except (
            binascii.Error,
            json.JSONDecodeError,
            KeyError,
            TypeError,
            UnicodeDecodeError,
            ValueError,
        ) as exception:
            raise InvalidGitHubState from exception
        if not isinstance(session_id, str) or not session_id or expires_at < int(time.time()):
            raise InvalidGitHubState
        return session_id

    async def installation_token(
        self,
        installation_id: int,
        repository_id: int | None = None,
    ) -> str:
        self._require_configured()
        cache_key = (installation_id, repository_id)
        now = datetime.now(timezone.utc)
        cached = self._tokens.get(cache_key)
        if cached is not None and now < cached.usable_until:
            return cached.value

        async with self._token_lock:
            now = datetime.now(timezone.utc)
            cached = self._tokens.get(cache_key)
            if cached is not None and now < cached.usable_until:
                return cached.value

            body: dict[str, object] = {
                "permissions": {"contents": "write", "pull_requests": "write"}
            }
            if repository_id is not None:
                body["repository_ids"] = [repository_id]
            response = await self._request(
                "POST",
                f"/app/installations/{installation_id}/access_tokens",
                headers=self._headers(self._app_jwt()),
                json=body,
            )
            if response.is_error:
                raise GitHubAPIError(
                    "GitHub rejected the installation token request",
                    response.status_code,
                )
            try:
                payload = response.json()
                token = payload["token"]
                expires_at = datetime.fromisoformat(
                    payload["expires_at"].replace("Z", "+00:00")
                )
            except (KeyError, TypeError, ValueError) as exception:
                raise GitHubAPIError("GitHub returned an invalid installation token") from exception
            if not isinstance(token, str):
                raise GitHubAPIError("GitHub returned an invalid installation token")

            usable_until = min(
                expires_at - timedelta(seconds=60),
                now + timedelta(minutes=59),
            )
            self._tokens[cache_key] = _CachedToken(token, usable_until)
            return token

    async def installation_account(self, installation_id: int) -> str:
        self._require_configured()
        response = await self._request(
            "GET",
            f"/app/installations/{installation_id}",
            headers=self._headers(self._app_jwt()),
        )
        if response.is_error:
            raise GitHubAPIError(
                "GitHub rejected the installation lookup", response.status_code
            )
        try:
            account = response.json()["account"]["login"]
        except (KeyError, TypeError, ValueError) as exception:
            raise GitHubAPIError("GitHub returned invalid installation metadata") from exception
        if not isinstance(account, str) or not account:
            raise GitHubAPIError("GitHub returned invalid installation metadata")
        return account

    def _app_jwt(self) -> str:
        try:
            private_key = Path(self.config.private_key_path or "").read_bytes()
            now = int(time.time())
            return jwt.encode(
                {"iat": now - 60, "exp": now + 540, "iss": self.config.app_id},
                private_key,
                algorithm="RS256",
            )
        except (OSError, ValueError) as exception:
            raise GitHubConfigurationError("GitHub App private key is unavailable") from exception

    def _require_configured(self) -> None:
        configured, detail = self.status()
        if not configured:
            raise GitHubConfigurationError(detail or "GitHub App is not configured")

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        if self._client is not None:
            return await self._client.request(method, path, **kwargs)
        async with httpx.AsyncClient(base_url=self._api_url, timeout=30) as client:
            return await client.request(method, path, **kwargs)

    @staticmethod
    def _headers(token: str) -> dict[str, str]:
        return {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
        }

    @staticmethod
    def _base64url(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")

    @staticmethod
    def _decode_base64url(value: str) -> bytes:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))