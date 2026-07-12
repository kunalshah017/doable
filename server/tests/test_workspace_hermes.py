import json

import httpx
import pytest

from app.hermes_service import HermesInvalidResponse
from app.models import StaticSourceWorkspace
from app.workspace_hermes import WorkspaceHermesService


def workspace() -> StaticSourceWorkspace:
    return StaticSourceWorkspace(
        base_commit_sha="a" * 40,
        files={"index.html": "<main></main>"},
    )


@pytest.mark.asyncio
async def test_hermes_returns_only_changed_supported_files() -> None:
    response = {
        "id": "response-1",
        "output_text": json.dumps(
            {
                "patchId": "model-controlled",
                "baseCommitSha": "model-controlled",
                "files": {
                    "index.html": "<main><button>New</button></main>",
                },
                "summary": ["Added the new button"],
                "rationale": "Matches the request",
            }
        ),
    }

    async def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=response)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(respond),
    ) as client:
        service = WorkspaceHermesService("http://hermes.test", "key", client)

        patch, response_id = await service.preview(
            "Add a button",
            workspace(),
            None,
            "session-1",
        )

    assert patch.files == {
        "index.html": "<main><button>New</button></main>",
    }
    assert patch.patch_id != "model-controlled"
    assert patch.base_commit_sha == "a" * 40
    assert response_id == "response-1"


@pytest.mark.asyncio
async def test_hermes_rejects_an_unsupported_file() -> None:
    response = {
        "output_text": json.dumps(
            {
                "files": {"package.json": "{}"},
                "summary": ["Changed package metadata"],
                "rationale": "Unsupported",
            }
        ),
    }

    async def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=response)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(respond),
    ) as client:
        service = WorkspaceHermesService("http://hermes.test", "key", client)

        with pytest.raises(HermesInvalidResponse, match="invalid workspace patch"):
            await service.preview("Change dependencies", workspace(), None, "session-1")