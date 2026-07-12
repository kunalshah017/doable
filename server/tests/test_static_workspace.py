import pytest

from app.static_workspace import StaticWorkspaceLoader, StaticWorkspaceUnavailable


class Client:
    async def get_ref(self, _repository: str, _branch: str) -> str:
        return "base-sha"

    async def read_optional_file(
        self,
        _repository: str,
        path: str,
        _ref: str,
    ) -> str | None:
        return {
            "index.html": "<html><body>Old</body></html>",
            "styles.css": "body { color: black; }",
            "script.js": None,
        }[path]


@pytest.mark.asyncio
async def test_loader_reads_root_static_workspace() -> None:
    workspace = await StaticWorkspaceLoader().load(Client(), "owner/repo", "main")

    assert workspace.base_commit_sha == "base-sha"
    assert workspace.files == {
        "index.html": "<html><body>Old</body></html>",
        "styles.css": "body { color: black; }",
    }


@pytest.mark.asyncio
async def test_loader_requires_root_index() -> None:
    class MissingIndexClient(Client):
        async def read_optional_file(
            self,
            _repository: str,
            _path: str,
            _ref: str,
        ) -> str | None:
            return None

    with pytest.raises(StaticWorkspaceUnavailable, match="root index.html"):
        await StaticWorkspaceLoader().load(
            MissingIndexClient(),
            "owner/repo",
            "main",
        )
