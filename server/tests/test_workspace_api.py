import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app, store
from app.models import StaticSourceWorkspace


@pytest.mark.asyncio
async def test_workspace_draft_approval_routes() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        created = (await client.post("/v1/sessions")).json()
        session_id = created["sessionId"]
        headers = {"X-Doable-Session-Token": created["sessionToken"]}
        store.set_workspace_source(
            session_id,
            created["sessionToken"],
            StaticSourceWorkspace(
                base_commit_sha="a" * 40,
                files={"index.html": "<main>Original</main>"},
            ),
        )
        draft = await client.put(
            f"/v1/sessions/{session_id}/workspace/draft",
            headers=headers,
            json={
                "request": "Replace the main copy",
                "patch": {
                    "patchId": "patch-1",
                    "baseCommitSha": "a" * 40,
                    "files": {"index.html": "<main>Updated</main>"},
                    "summary": ["Updated the main copy"],
                    "rationale": "Matches the request.",
                },
                "beforeScreenshot": "before",
                "afterScreenshot": "after",
                "qa": {
                    "passed": True,
                    "checks": ["sandbox_preview_applied"],
                },
            },
        )
        approval = await client.post(
            f"/v1/sessions/{session_id}/workspace/changes/approve",
            headers=headers,
        )
        changes = await client.get(
            f"/v1/sessions/{session_id}/workspace/changes",
            headers=headers,
        )

    assert draft.status_code == 200
    assert approval.status_code == 200
    assert changes.status_code == 200
    assert changes.json()["changes"][0]["workspacePatch"]["files"] == {
        "index.html": "<main>Updated</main>",
    }
