import pytest

from app.models import StaticSourceWorkspace, WorkspacePatch
from app.workspace_preview import (
    WorkspacePreviewInvalid,
    apply_workspace_patch,
    build_preview_document,
)


def workspace() -> StaticSourceWorkspace:
    return StaticSourceWorkspace(
        base_commit_sha="a" * 40,
        files={
            "index.html": (
                '<!doctype html><html><head><link rel="stylesheet" href="styles.css">'
                '</head><body><button id="toggle">Open</button>'
                '<script src="script.js"></script></body></html>'
            ),
            "styles.css": "button { color: red; }",
            "script.js": (
                "document.querySelector('#toggle')"
                ".addEventListener('click', () => {});"
            ),
        },
    )


def patch(files: dict[str, str]) -> WorkspacePatch:
    return WorkspacePatch(
        patch_id="patch-1",
        base_commit_sha="a" * 40,
        files=files,
        summary=["Updated the static page"],
        rationale="Matches the manager request.",
    )


def test_preview_inlines_changed_css_and_javascript() -> None:
    updated = apply_workspace_patch(
        workspace(),
        patch({"styles.css": "button { color: green; }"}),
    )

    document = build_preview_document(updated)

    assert "button { color: green; }" in document
    assert "addEventListener" in document
    assert 'href="styles.css"' not in document
    assert 'src="script.js"' not in document


@pytest.mark.parametrize(
    ("path", "content", "detail"),
    [
        (
            "index.html",
            '<button onclick="steal()">Open</button>',
            "inline event handler",
        ),
        (
            "styles.css",
            "@import url(https://evil.test/x.css);",
            "unsafe CSS",
        ),
        ("script.js", "fetch('https://evil.test')", "network API"),
    ],
)
def test_preview_rejects_unsafe_source(
    path: str,
    content: str,
    detail: str,
) -> None:
    with pytest.raises(WorkspacePreviewInvalid, match=detail):
        apply_workspace_patch(workspace(), patch({path: content}))


def test_preview_rejects_invalid_javascript() -> None:
    with pytest.raises(WorkspacePreviewInvalid, match="invalid JavaScript"):
        apply_workspace_patch(workspace(), patch({"script.js": "const = ;"}))


def test_preview_rejects_a_different_base_commit() -> None:
    mismatched = patch({"index.html": "<main>New</main>"}).model_copy(
        update={"base_commit_sha": "b" * 40},
    )

    with pytest.raises(WorkspacePreviewInvalid, match="base commit"):
        apply_workspace_patch(workspace(), mismatched)