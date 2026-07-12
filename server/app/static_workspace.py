from typing import Protocol

from app.models import StaticFilePath, StaticSourceWorkspace

SUPPORTED_STATIC_FILES: tuple[StaticFilePath, ...] = (
    "index.html",
    "styles.css",
    "script.js",
)


class StaticWorkspaceUnavailable(Exception):
    pass


class StaticWorkspaceClient(Protocol):
    async def get_ref(self, repository: str, branch: str) -> str: ...

    async def read_optional_file(
        self,
        repository: str,
        path: str,
        ref: str,
    ) -> str | None: ...


class StaticWorkspaceLoader:
    async def load(
        self,
        client: StaticWorkspaceClient,
        repository: str,
        branch: str,
    ) -> StaticSourceWorkspace:
        base_sha = await client.get_ref(repository, branch)
        files: dict[StaticFilePath, str] = {}
        for path in SUPPORTED_STATIC_FILES:
            content = await client.read_optional_file(repository, path, base_sha)
            if content is not None:
                files[path] = content
        if "index.html" not in files:
            raise StaticWorkspaceUnavailable("Repository has no root index.html")
        return StaticSourceWorkspace(base_commit_sha=base_sha, files=files)