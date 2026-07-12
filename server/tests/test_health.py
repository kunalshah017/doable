import pytest
from httpx import ASGITransport, AsyncClient
from types import SimpleNamespace
from datetime import datetime, timezone

from app.main import app, github_app
from app.models import RepositoryBinding
from app.release_service import ReleaseService
from app.sessions import ReleaseSnapshot


@pytest.mark.asyncio
async def test_health_reports_ok() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_github_callback_requires_authenticated_confirmation(monkeypatch) -> None:
    monkeypatch.setattr(
        github_app,
        "installation_url",
        lambda session_id, nonce: f"https://github.test/install?state={session_id}:{nonce}",
    )
    monkeypatch.setattr(
        github_app,
        "verify_state",
        lambda state: tuple(state.split(":", 1)),
    )

    async def installation_account(_installation_id: int) -> str:
        return "approved-account"

    monkeypatch.setattr(github_app, "installation_account",
                        installation_account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = (await client.post("/v1/sessions")).json()
        headers = {"X-Doable-Session-Token": created["sessionToken"]}
        start = await client.post(
            f"/v1/sessions/{created['sessionId']}/github/install/start",
            headers=headers,
        )
        state = start.json()["installUrl"].split("state=", 1)[1]

        callback = await client.get(
            "/v1/github/callback",
            params={"installation_id": 123,
                    "setup_action": "install", "state": state},
        )
        pending_status = await client.get(
            "/v1/github/status",
            params={"sessionId": created["sessionId"]},
            headers=headers,
        )
        unauthenticated_confirm = await client.post(
            f"/v1/sessions/{created['sessionId']}/github/install/confirm"
        )
        confirmed = await client.post(
            f"/v1/sessions/{created['sessionId']}/github/install/confirm",
            headers=headers,
        )
        connected_status = await client.get(
            "/v1/github/status",
            params={"sessionId": created["sessionId"]},
            headers=headers,
        )

    assert callback.status_code == 200
    assert pending_status.json() | {"detail": None} == {
        "configured": False,
        "connected": False,
        "pendingAccount": "approved-account",
        "detail": None,
    }
    assert unauthenticated_confirm.status_code == 403
    assert confirmed.json() == {"installationId": 123,
                                "account": "approved-account"}
    assert connected_status.json()["connected"] is True


@pytest.mark.asyncio
async def test_release_retry_reuses_matching_ref_and_open_pull_request() -> None:
    class Translator:
        def apply(self, _html, _css, _change):
            return SimpleNamespace(
                html_source='<button data-doable-id="cta">New</button>',
                css_source="",
                changed_files={
                    "index.html": '<button data-doable-id="cta">New</button>'},
            )

    class Client:
        created_ref = False
        created_pull_request = False

        async def get_ref(self, _repository, _branch):
            return "base-sha"

        async def get_optional_ref(self, _repository, _branch):
            return "commit-final"

        async def get_commit(self, _repository, _sha):
            return {"sha": "base-sha", "tree_sha": "tree-base"}

        async def read_file(self, _repository, path, _ref):
            return '<button data-doable-id="cta">Old</button>' if path == "index.html" else ""

        async def create_tree(self, _repository, _tree_sha, _changed_files):
            return "tree-final"

        async def create_commit(self, _repository, _message, _tree_sha, _parent_sha, _created_at):
            return "commit-final"

        async def create_ref(self, _repository, _branch, _commit_sha):
            self.created_ref = True

        async def find_open_pull_request(self, _repository, _head, _base):
            return 17, "https://github.test/pull/17"

        async def create_pull_request(self, *_args):
            self.created_pull_request = True
            return 18, "https://github.test/pull/18"

    snapshot = ReleaseSnapshot(
        ledger_hash="a" * 64,
        changes=(
            SimpleNamespace(
                request="Update CTA",
                change_id="change-1",
                qa=SimpleNamespace(passed=True, checks=[
                                   "browser_preview_applied"]),
                approved_at=datetime(2026, 7, 12, tzinfo=timezone.utc),
            ),
        ),
        repository=RepositoryBinding(
            repository_id=1,
            full_name="owner/repo",
            default_branch="main",
            private=True,
            html_url="https://github.test/owner/repo",
            installation_id=2,
            account="owner",
        ),
    )
    client = Client()

    result = await ReleaseService(Translator()).release(snapshot, client)

    assert result.pull_request_number == 17
    assert result.branch == f"doable/{snapshot.ledger_hash[:12]}"
    assert client.created_ref is False
    assert client.created_pull_request is False
