import base64

import httpx
import pytest

from app.github_client import GitHubClient


class GitHubAppStub:
    async def installation_token(
        self,
        _installation_id: int,
        _repository_id: int | None = None,
    ) -> str:
        return "installation-token"


@pytest.mark.asyncio
async def test_read_file_accepts_github_wrapped_base64() -> None:
    encoded = base64.b64encode(b"<main>Doable</main>").decode("ascii")
    wrapped = "\n".join(encoded[index:index + 8]
                        for index in range(0, len(encoded), 8))

    async def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"content": wrapped, "encoding": "base64"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(respond),
        base_url="https://api.github.test",
    ) as http_client:
        client = GitHubClient(GitHubAppStub(), 1, 2, client=http_client)

        content = await client.read_file("owner/repository", "index.html", "base-sha")

    assert content == "<main>Doable</main>"
