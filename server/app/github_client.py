import base64
from urllib.parse import quote

import httpx

from app.github_app import GITHUB_API_URL, GITHUB_API_VERSION, GitHubAPIError, GitHubApp
from app.models import RepositorySummary


class GitHubClient:
    def __init__(
        self,
        github_app: GitHubApp,
        installation_id: int,
        repository_id: int | None = None,
        client: httpx.AsyncClient | None = None,
        api_url: str = GITHUB_API_URL,
    ) -> None:
        self._app = github_app
        self._installation_id = installation_id
        self._repository_id = repository_id
        self._client = client
        self._api_url = api_url.rstrip("/")

    async def list_repositories(self) -> list[RepositorySummary]:
        result: list[RepositorySummary] = []
        page = 1
        while True:
            response = await self._request(
                "GET",
                "/installation/repositories",
                params={"per_page": 100, "page": page},
            )
            payload = self._json(response)
            repositories = (
                payload.get("repositories") if isinstance(payload, dict) else None
            )
            if not isinstance(repositories, list):
                raise GitHubAPIError("GitHub returned an invalid repository list")
            result.extend(
                self._repository_summary(repository) for repository in repositories
            )
            if len(repositories) < 100:
                return result
            page += 1

    async def get_repository(self, repository_id: int) -> RepositorySummary:
        payload = self._json(await self._request("GET", f"/repositories/{repository_id}"))
        return self._repository_summary(payload)

    async def get_ref(self, full_name: str, branch: str) -> str:
        payload = self._json(
            await self._request(
                "GET", f"/repos/{full_name}/git/ref/heads/{quote(branch, safe='')}"
            )
        )
        try:
            return payload["object"]["sha"]
        except (KeyError, TypeError) as exception:
            raise GitHubAPIError("GitHub returned an invalid branch reference") from exception

    async def get_commit(self, full_name: str, commit_sha: str) -> dict[str, str]:
        payload = self._json(
            await self._request("GET", f"/repos/{full_name}/git/commits/{commit_sha}")
        )
        try:
            return {"sha": payload["sha"], "tree_sha": payload["tree"]["sha"]}
        except (KeyError, TypeError) as exception:
            raise GitHubAPIError("GitHub returned invalid commit metadata") from exception

    async def read_file(self, full_name: str, path: str, ref: str) -> str:
        payload = self._json(
            await self._request(
                "GET",
                f"/repos/{full_name}/contents/{quote(path, safe='/')}",
                params={"ref": ref},
            )
        )
        try:
            content = payload["content"]
            encoding = payload["encoding"]
        except (KeyError, TypeError) as exception:
            raise GitHubAPIError(f"GitHub returned invalid content for {path}") from exception
        if encoding != "base64" or not isinstance(content, str):
            raise GitHubAPIError(f"Unsupported GitHub content encoding for {path}")
        try:
            return base64.b64decode(content, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as exception:
            raise GitHubAPIError(f"Repository file is not valid UTF-8: {path}") from exception

    async def create_tree(
        self,
        full_name: str,
        base_tree_sha: str,
        files: dict[str, str],
    ) -> str:
        tree = [
            {"path": path, "mode": "100644", "type": "blob", "content": content}
            for path, content in sorted(files.items())
        ]
        payload = self._json(
            await self._request(
                "POST",
                f"/repos/{full_name}/git/trees",
                json={"base_tree": base_tree_sha, "tree": tree},
            )
        )
        return self._required_string(payload, "sha", "tree")

    async def create_commit(
        self,
        full_name: str,
        message: str,
        tree_sha: str,
        parent_sha: str,
    ) -> str:
        payload = self._json(
            await self._request(
                "POST",
                f"/repos/{full_name}/git/commits",
                json={"message": message, "tree": tree_sha, "parents": [parent_sha]},
            )
        )
        return self._required_string(payload, "sha", "commit")

    async def create_ref(self, full_name: str, branch: str, commit_sha: str) -> None:
        await self._request(
            "POST",
            f"/repos/{full_name}/git/refs",
            json={"ref": f"refs/heads/{branch}", "sha": commit_sha},
        )

    async def create_pull_request(
        self,
        full_name: str,
        title: str,
        body: str,
        head: str,
        base: str,
    ) -> tuple[int, str]:
        payload = self._json(
            await self._request(
                "POST",
                f"/repos/{full_name}/pulls",
                json={"title": title, "body": body, "head": head, "base": base},
            )
        )
        try:
            number = int(payload["number"])
            html_url = payload["html_url"]
        except (KeyError, TypeError, ValueError) as exception:
            raise GitHubAPIError("GitHub returned invalid pull request metadata") from exception
        if not isinstance(html_url, str):
            raise GitHubAPIError("GitHub returned invalid pull request metadata")
        return number, html_url

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        token = await self._app.installation_token(
            self._installation_id, self._repository_id
        )
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
        }
        if self._client is not None:
            response = await self._client.request(method, path, headers=headers, **kwargs)
        else:
            async with httpx.AsyncClient(base_url=self._api_url, timeout=30) as client:
                response = await client.request(method, path, headers=headers, **kwargs)
        if response.is_error:
            raise GitHubAPIError("GitHub API request failed", response.status_code)
        return response

    @staticmethod
    def _json(response: httpx.Response):
        try:
            return response.json()
        except ValueError as exception:
            raise GitHubAPIError("GitHub returned a non-JSON response") from exception

    @staticmethod
    def _repository_summary(payload) -> RepositorySummary:
        try:
            return RepositorySummary(
                repository_id=payload["id"],
                full_name=payload["full_name"],
                default_branch=payload["default_branch"],
                private=payload["private"],
                html_url=payload["html_url"],
            )
        except (KeyError, TypeError, ValueError) as exception:
            raise GitHubAPIError("GitHub returned invalid repository metadata") from exception

    @staticmethod
    def _required_string(payload, key: str, resource: str) -> str:
        value = payload.get(key) if isinstance(payload, dict) else None
        if not isinstance(value, str):
            raise GitHubAPIError(f"GitHub returned invalid {resource} metadata")
        return value