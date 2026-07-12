from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.models import RepositoryBinding, WorkspacePatch
from app.release_service import ReleaseBlocked, ReleaseService
from app.sessions import WorkspaceReleaseSnapshot


def approved_patch(
    change_id: str,
    files: dict[str, str],
) -> SimpleNamespace:
    return SimpleNamespace(
        change_id=change_id,
        request=f"Apply {change_id}",
        workspace_patch=WorkspacePatch(
            patch_id=f"patch-{change_id}",
            base_commit_sha="base-sha",
            files=files,
            summary=[f"Applied {change_id}"],
            rationale="Matches the request.",
        ),
        qa=SimpleNamespace(passed=True, checks=["sandbox_preview_applied"]),
        approved_at=datetime(2026, 7, 12, tzinfo=timezone.utc),
    )


def snapshot(base_sha: str = "base-sha") -> WorkspaceReleaseSnapshot:
    return WorkspaceReleaseSnapshot(
        ledger_hash="a" * 64,
        base_commit_sha=base_sha,
        changes=(
            approved_patch("one", {"index.html": "<main>One</main>"}),
            approved_patch(
                "two",
                {
                    "styles.css": "main { color: green; }",
                    "script.js": "console.log('ready')",
                },
            ),
        ),
        repository=RepositoryBinding(
            repository_id=1,
            full_name="owner/repository",
            default_branch="main",
            private=False,
            html_url="https://github.test/owner/repository",
            installation_id=2,
            account="owner",
        ),
    )


class RecordingClient:
    def __init__(self, base_sha: str = "base-sha") -> None:
        self.base_sha = base_sha
        self.created_trees: list[dict[str, str]] = []
        self.created_commits: list[str] = []
        self.created_pull_request = False

    async def get_ref(self, _repository: str, _branch: str) -> str:
        return self.base_sha

    async def get_commit(self, _repository: str, sha: str) -> dict[str, str]:
        return {"sha": sha, "tree_sha": "tree-base"}

    async def create_tree(
        self,
        _repository: str,
        _tree_sha: str,
        files: dict[str, str],
    ) -> str:
        self.created_trees.append(files)
        return f"tree-{len(self.created_trees)}"

    async def create_commit(self, *_args) -> str:
        sha = f"commit-{len(self.created_commits) + 1}"
        self.created_commits.append(sha)
        return sha

    async def get_optional_ref(self, _repository: str, _branch: str) -> None:
        return None

    async def create_ref(self, *_args) -> None:
        return None

    async def find_open_pull_request(self, *_args) -> None:
        return None

    async def create_pull_request(self, *_args) -> tuple[int, str]:
        self.created_pull_request = True
        return 21, "https://github.test/pull/21"


@pytest.mark.asyncio
async def test_workspace_release_writes_exact_approved_files_in_order() -> None:
    client = RecordingClient()

    result = await ReleaseService().release_workspace(snapshot(), client)

    assert client.created_trees == [
        {"index.html": "<main>One</main>"},
        {
            "styles.css": "main { color: green; }",
            "script.js": "console.log('ready')",
        },
    ]
    assert result.commit_shas == ["commit-1", "commit-2"]
    assert client.created_pull_request is True


@pytest.mark.asyncio
async def test_workspace_release_blocks_when_base_branch_moved() -> None:
    client = RecordingClient(base_sha="current-base")

    with pytest.raises(ReleaseBlocked, match="default branch moved"):
        await ReleaseService().release_workspace(
            snapshot(base_sha="approved-base"),
            client,
        )

    assert client.created_trees == []