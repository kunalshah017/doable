import os
from typing import Any

import httpx


class ConvexUnavailable(Exception):
    pass


class ConvexClient:
    def __init__(self, url: str | None = None, timeout: float = 3.0) -> None:
        self._url = (url if url is not None else os.getenv(
            "CONVEX_URL", "")).rstrip("/")
        self._timeout = timeout

    @property
    def configured(self) -> bool:
        return bool(self._url)

    def query(self, path: str, args: dict[str, Any]) -> Any:
        return self._call("query", path, args)

    def mutation(self, path: str, args: dict[str, Any]) -> Any:
        return self._call("mutation", path, args)

    def _call(self, operation: str, path: str, args: dict[str, Any]) -> Any:
        if not self.configured:
            raise ConvexUnavailable("Convex persistence is not configured")
        try:
            response = httpx.post(
                f"{self._url}/api/{operation}",
                json={"path": path, "args": args, "format": "json"},
                timeout=self._timeout,
            )
            response.raise_for_status()
            result = response.json()
        except (httpx.HTTPError, ValueError) as exception:
            raise ConvexUnavailable(
                "Convex persistence is unavailable") from exception
        if not isinstance(result, dict) or result.get("status") != "success":
            raise ConvexUnavailable("Convex persistence request failed")
        return result.get("value")
