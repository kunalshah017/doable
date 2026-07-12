from app.models import (
    GitHubInstallation,
    QAResult,
    RepositoryBinding,
    StaticSourceWorkspace,
    WorkspaceDraftRequest,
    WorkspacePatch,
)
from app.sessions import SessionStore


def patch(patch_id: str, files: dict[str, str]) -> WorkspacePatch:
    return WorkspacePatch(
        patch_id=patch_id,
        base_commit_sha="a" * 40,
        files=files,
        summary=[f"Applied {patch_id}"],
        rationale="Matches the manager request.",
    )


def draft(workspace_patch: WorkspacePatch) -> WorkspaceDraftRequest:
    return WorkspaceDraftRequest(
        request=workspace_patch.summary[0],
        patch=workspace_patch,
        before_screenshot="before",
        after_screenshot="after",
        qa=QAResult(passed=True, checks=["sandbox_preview_applied"]),
    )


def test_workspace_approvals_compose_in_order_and_reset_preserves_repository() -> None:
    store = SessionStore()
    created = store.create()
    state = store._state(created.session_id)
    installation = GitHubInstallation(installation_id=2, account="owner")
    repository = RepositoryBinding(
        repository_id=1,
        full_name="owner/repository",
        default_branch="main",
        private=False,
        html_url="https://github.test/owner/repository",
        installation_id=2,
        account="owner",
    )
    state.github_installation = installation
    state.repository = repository
    store.set_workspace_source(
        created.session_id,
        created.session_token,
        StaticSourceWorkspace(
            base_commit_sha="a" * 40,
            files={"index.html": "<main>Original</main>"},
        ),
    )

    first = patch("patch-1", {"index.html": "<main>One</main>"})
    store.set_workspace_draft(
        created.session_id,
        created.session_token,
        draft(first),
    )
    first_approval = store.approve_workspace_draft(
        created.session_id,
        created.session_token,
    )

    second = patch("patch-2", {"styles.css": "main { color: green; }"})
    store.set_workspace_draft(
        created.session_id,
        created.session_token,
        draft(second),
    )
    second_approval = store.approve_workspace_draft(
        created.session_id,
        created.session_token,
    )

    changes = store.get_workspace_changes(
        created.session_id,
        created.session_token,
    )
    composed = store.get_workspace_source(
        created.session_id,
        created.session_token,
        composed=True,
    )
    assert [change.change_id for change in changes] == [
        first_approval.change.change_id,
        second_approval.change.change_id,
    ]
    assert second_approval.ledger_hash != first_approval.ledger_hash
    assert composed.files == {
        "index.html": "<main>One</main>",
        "styles.css": "main { color: green; }",
    }
    release = store.prepare_workspace_release(
        created.session_id,
        created.session_token,
        second_approval.approval_token,
        [change.change_id for change in changes],
    )
    assert release.base_commit_sha == "a" * 40
    assert release.ledger_hash == second_approval.ledger_hash

    store.reset_workspace(created.session_id, created.session_token)

    assert store.get_workspace_changes(
        created.session_id,
        created.session_token,
    ) == []
    assert store.get_status(
        created.session_id,
        created.session_token,
    ).repository == repository
