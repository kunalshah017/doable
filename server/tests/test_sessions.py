from types import SimpleNamespace

from app.models import GitHubInstallation, RepositoryBinding
from app.sessions import SessionStore


def test_reset_workspace_clears_working_state_and_preserves_github_binding() -> None:
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
    state.selection = SimpleNamespace()
    state.draft = SimpleNamespace()
    state.approved_changes = [SimpleNamespace()]
    state.approval = SimpleNamespace()
    state.github_installation = installation
    state.repository = repository

    store.reset_workspace(created.session_id, created.session_token)

    assert state.selection is None
    assert state.draft is None
    assert state.approved_changes == []
    assert state.approval is None
    assert state.github_installation == installation
    assert state.repository == repository
