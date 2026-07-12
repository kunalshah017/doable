import pytest
from pydantic import ValidationError

from app.models import StaticSourceWorkspace, WorkspacePatch


def test_workspace_patch_accepts_supported_files() -> None:
    patch = WorkspacePatch(
        patch_id="patch-1",
        base_commit_sha="a" * 40,
        files={
            "index.html": "<main>New</main>",
            "script.js": "console.log('ok')",
        },
        summary=["Replaced the main content", "Added interaction logging"],
        rationale="Matches the approved manager request.",
    )

    assert set(patch.files) == {"index.html", "script.js"}


def test_workspace_patch_rejects_unsupported_files() -> None:
    with pytest.raises(ValidationError):
        WorkspacePatch(
            patch_id="patch-1",
            base_commit_sha="a" * 40,
            files={"package.json": "{}"},
            summary=["Changed package metadata"],
            rationale="Unsupported.",
        )


def test_workspace_requires_index_html() -> None:
    with pytest.raises(ValidationError):
        StaticSourceWorkspace(
            base_commit_sha="a" * 40,
            files={"styles.css": "body {}"},
        )