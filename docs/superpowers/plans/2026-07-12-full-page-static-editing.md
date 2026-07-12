# Full-Page Static Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Doable preview, approve, and release exact source-first edits to root `index.html`, `styles.css`, and `script.js`, including new HTML structures, full CSS, and sandboxed JavaScript interactions.

**Architecture:** Add a parallel static-workspace path beside the legacy element patch path. The server reads supported files from the bound GitHub repository, Hermes returns complete contents for changed files, validation produces a sandbox preview document, and a workspace approval ledger stores exact file snapshots. The extension displays the preview in an isolated full-page iframe, while release writes the approved files directly without `data-doable-id` translation.

**Tech Stack:** FastAPI, Pydantic, HTTPX, tinycss2, Python HTMLParser, Hermes OpenAI-compatible API, React 19, TypeScript, Chrome Manifest V3, Vitest, pytest, GitHub Git Data API.

---

## Task 1: Define static workspace contracts

**Files:**

- Modify: `server/app/models.py`
- Modify: `extension/packages/shared/lib/doable-contracts.ts`
- Create: `server/tests/test_workspace_models.py`

- [ ] **Step 1: Write failing model validation tests**

```python
import pytest
from pydantic import ValidationError

from app.models import StaticSourceWorkspace, WorkspacePatch


def test_workspace_patch_accepts_supported_files() -> None:
    patch = WorkspacePatch(
        patch_id="patch-1",
        base_commit_sha="a" * 40,
        files={"index.html": "<main>New</main>", "script.js": "console.log('ok')"},
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
        StaticSourceWorkspace(base_commit_sha="a" * 40, files={"styles.css": "body {}"})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd server && uv run pytest tests/test_workspace_models.py -q`

Expected: FAIL because `StaticSourceWorkspace` and `WorkspacePatch` do not exist.

- [ ] **Step 3: Add matching Python and TypeScript contracts**

```python
from typing import Literal

StaticFilePath = Literal["index.html", "styles.css", "script.js"]


class StaticSourceWorkspace(APIModel):
    base_commit_sha: str = Field(min_length=7, max_length=64)
    files: dict[StaticFilePath, str]

    @field_validator("files")
    @classmethod
    def require_index_html(cls, files: dict[StaticFilePath, str]) -> dict[StaticFilePath, str]:
        if "index.html" not in files:
            raise ValueError("Static workspace requires index.html")
        return files


class WorkspacePatch(APIModel):
    patch_id: str
    selection_id: str | None = None
    base_commit_sha: str = Field(min_length=7, max_length=64)
    files: dict[StaticFilePath, str] = Field(min_length=1)
    summary: list[str] = Field(min_length=1, max_length=12)
    rationale: str = Field(min_length=1, max_length=2_000)
```

```ts
export type StaticFilePath = 'index.html' | 'styles.css' | 'script.js';

export type StaticSourceWorkspace = {
  baseCommitSha: string;
  files: Partial<Record<StaticFilePath, string>> & { 'index.html': string };
};

export type WorkspacePatch = {
  patchId: string;
  selectionId?: string;
  baseCommitSha: string;
  files: Partial<Record<StaticFilePath, string>>;
  summary: string[];
  rationale: string;
};
```

- [ ] **Step 4: Run model tests and shared type-check**

Run: `cd server && uv run pytest tests/test_workspace_models.py -q && cd ../extension && pnpm --filter @extension/shared type-check`

Expected: all checks pass.

- [ ] **Step 5: Commit the contracts**

```bash
git add server/app/models.py server/tests/test_workspace_models.py extension/packages/shared/lib/doable-contracts.ts
git commit -m "feat: add static workspace contracts"
```

## Task 2: Read supported source files from GitHub

**Files:**

- Modify: `server/app/github_client.py`
- Create: `server/app/static_workspace.py`
- Create: `server/tests/test_static_workspace.py`

- [ ] **Step 1: Write failing source-loader tests**

```python
import pytest

from app.static_workspace import StaticWorkspaceLoader, StaticWorkspaceUnavailable


class Client:
    async def get_ref(self, _repository: str, _branch: str) -> str:
        return "base-sha"

    async def read_optional_file(self, _repository: str, path: str, _ref: str) -> str | None:
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
        async def read_optional_file(self, _repository: str, _path: str, _ref: str) -> str | None:
            return None

    with pytest.raises(StaticWorkspaceUnavailable, match="root index.html"):
        await StaticWorkspaceLoader().load(MissingIndexClient(), "owner/repo", "main")
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd server && uv run pytest tests/test_static_workspace.py -q`

Expected: FAIL because the loader and optional read do not exist.

- [ ] **Step 3: Add optional GitHub reads and the loader**

```python
async def read_optional_file(self, full_name: str, path: str, ref: str) -> str | None:
    try:
        return await self.read_file(full_name, path, ref)
    except GitHubAPIError as exception:
        if exception.status_code == 404:
            return None
        raise
```

```python
from app.models import StaticSourceWorkspace

SUPPORTED_STATIC_FILES = ("index.html", "styles.css", "script.js")


class StaticWorkspaceUnavailable(Exception):
    pass


class StaticWorkspaceLoader:
    async def load(self, client, repository: str, branch: str) -> StaticSourceWorkspace:
        base_sha = await client.get_ref(repository, branch)
        files = {}
        for path in SUPPORTED_STATIC_FILES:
            content = await client.read_optional_file(repository, path, base_sha)
            if content is not None:
                files[path] = content
        if "index.html" not in files:
            raise StaticWorkspaceUnavailable("Repository has no root index.html")
        return StaticSourceWorkspace(base_commit_sha=base_sha, files=files)
```

- [ ] **Step 4: Run loader and GitHub client tests**

Run: `cd server && uv run pytest tests/test_static_workspace.py tests/test_github_client.py -q`

Expected: all tests pass.

- [ ] **Step 5: Commit source loading**

```bash
git add server/app/github_client.py server/app/static_workspace.py server/tests/test_static_workspace.py
git commit -m "feat: load static source workspace"
```

## Task 3: Validate files and build the sandbox document

**Files:**

- Create: `server/app/workspace_preview.py`
- Create: `server/tests/test_workspace_preview.py`

- [ ] **Step 1: Write failing validator and assembler tests**

```python
import pytest

from app.models import StaticSourceWorkspace, WorkspacePatch
from app.workspace_preview import WorkspacePreviewInvalid, apply_workspace_patch, build_preview_document


def workspace() -> StaticSourceWorkspace:
    return StaticSourceWorkspace(
        base_commit_sha="a" * 40,
        files={
            "index.html": '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><button id="toggle">Open</button><script src="script.js"></script></body></html>',
            "styles.css": "button { color: red; }",
            "script.js": "document.querySelector('#toggle').addEventListener('click', () => {});",
        },
    )


def test_preview_inlines_changed_css_and_javascript() -> None:
    patch = WorkspacePatch(
        patch_id="patch-1",
        base_commit_sha="a" * 40,
        files={"styles.css": "button { color: green; }"},
        summary=["Changed button color"],
        rationale="Requested style.",
    )
    updated = apply_workspace_patch(workspace(), patch)
    document = build_preview_document(updated)
    assert "button { color: green; }" in document
    assert "addEventListener" in document
    assert 'href="styles.css"' not in document
    assert 'src="script.js"' not in document


@pytest.mark.parametrize(
    "path,content,detail",
    [
        ("index.html", '<button onclick="steal()">Open</button>', "inline event handler"),
        ("styles.css", "@import url(https://evil.test/x.css);", "unsafe CSS"),
        ("script.js", "fetch('https://evil.test')", "network API"),
    ],
)
def test_preview_rejects_unsafe_source(path: str, content: str, detail: str) -> None:
    patch = WorkspacePatch(
        patch_id="patch-1",
        base_commit_sha="a" * 40,
        files={path: content},
        summary=["Unsafe change"],
        rationale="Rejected.",
    )
    with pytest.raises(WorkspacePreviewInvalid, match=detail):
        apply_workspace_patch(workspace(), patch)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd server && uv run pytest tests/test_workspace_preview.py -q`

Expected: FAIL because the validator module does not exist.

- [ ] **Step 3: Implement bounded validation and preview assembly**

```python
MAX_FILE_BYTES = 250_000
MAX_WORKSPACE_BYTES = 600_000
UNSAFE_HTML = re.compile(r"(?:\son[a-z]+\s*=|javascript\s*:|<\s*(?:base|object|embed)\b)", re.I)
UNSAFE_CSS = re.compile(r"(?:@import\b|expression\s*\(|javascript\s*:|-moz-binding)", re.I)
UNSAFE_JS = re.compile(
    r"(?:navigator\.serviceWorker|document\.cookie|localStorage|sessionStorage|window\.top|window\.opener|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon)",
)


def apply_workspace_patch(workspace: StaticSourceWorkspace, patch: WorkspacePatch) -> StaticSourceWorkspace:
    if patch.base_commit_sha != workspace.base_commit_sha:
        raise WorkspacePreviewInvalid("Patch base commit does not match workspace")
    files = dict(workspace.files)
    files.update(patch.files)
    validate_workspace(files)
    return StaticSourceWorkspace(base_commit_sha=workspace.base_commit_sha, files=files)


def build_preview_document(workspace: StaticSourceWorkspace) -> str:
    source = workspace.files["index.html"]
    source = re.sub(r'<link\b[^>]*href=["\']styles\.css["\'][^>]*>', "", source, flags=re.I)
    source = re.sub(r'<script\b[^>]*src=["\']script\.js["\'][^>]*>\s*</script>', "", source, flags=re.I)
    safe_css = workspace.files.get("styles.css", "").replace("</style", "<\\/style")
    safe_js = workspace.files.get("script.js", "").replace("</script", "<\\/script")
    style = f"<style data-doable-preview>{safe_css}</style>"
    script = f"<script data-doable-preview>{safe_js}</script>"
    source = source.replace("</head>", f"{style}</head>") if "</head>" in source.lower() else f"{style}{source}"
    return source.replace("</body>", f"{script}</body>") if "</body>" in source.lower() else f"{source}{script}"
```

```python
def validate_workspace(files: dict[str, str]) -> None:
    if "index.html" not in files:
        raise WorkspacePreviewInvalid("Static workspace requires index.html")
    if any(len(content.encode("utf-8")) > MAX_FILE_BYTES for content in files.values()):
        raise WorkspacePreviewInvalid("Workspace file exceeds 250 KB")
    if sum(len(content.encode("utf-8")) for content in files.values()) > MAX_WORKSPACE_BYTES:
        raise WorkspacePreviewInvalid("Workspace exceeds 600 KB")
    if UNSAFE_HTML.search(files["index.html"]):
        raise WorkspacePreviewInvalid("HTML contains an inline event handler or unsafe element")

    stylesheet = tinycss2.parse_stylesheet(files.get("styles.css", ""), skip_comments=False)
    if any(isinstance(node, tinycss2.ast.ParseError) for node in stylesheet) or UNSAFE_CSS.search(files.get("styles.css", "")):
        raise WorkspacePreviewInvalid("Workspace contains unsafe CSS")

    javascript = files.get("script.js", "")
    if UNSAFE_JS.search(javascript):
        raise WorkspacePreviewInvalid("JavaScript contains a denied network API")
    if javascript:
        result = subprocess.run(
            ["node", "--check", "-"],
            input=javascript,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if result.returncode != 0:
            raise WorkspacePreviewInvalid("script.js contains invalid JavaScript")
```

- [ ] **Step 4: Run validator tests**

Run: `cd server && uv run pytest tests/test_workspace_preview.py -q`

Expected: all tests pass.

- [ ] **Step 5: Commit preview validation**

```bash
git add server/app/workspace_preview.py server/tests/test_workspace_preview.py
git commit -m "feat: validate static workspace previews"
```

## Task 4: Generate exact source patches with Hermes

**Files:**

- Create: `server/app/workspace_hermes.py`
- Create: `server/tests/test_workspace_hermes.py`
- Modify: `server/app/main.py`

- [ ] **Step 1: Write failing Hermes parsing tests**

```python
import json

import httpx
import pytest

from app.models import StaticSourceWorkspace
from app.workspace_hermes import WorkspaceHermesService


@pytest.mark.asyncio
async def test_hermes_returns_only_changed_supported_files() -> None:
    response = {
        "id": "response-1",
        "output_text": json.dumps({
            "files": {"index.html": "<main><button>New</button></main>"},
            "summary": ["Added the new button"],
            "rationale": "Matches the request",
        }),
    }

    async def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=response)

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        service = WorkspaceHermesService("http://hermes.test", "key", client)
        patch, response_id = await service.preview(
            "Add a button",
            StaticSourceWorkspace(base_commit_sha="a" * 40, files={"index.html": "<main></main>"}),
            None,
            "session-1",
        )
    assert patch.files == {"index.html": "<main><button>New</button></main>"}
    assert patch.base_commit_sha == "a" * 40
    assert response_id == "response-1"
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd server && uv run pytest tests/test_workspace_hermes.py -q`

Expected: FAIL because `WorkspaceHermesService` does not exist.

- [ ] **Step 3: Implement the source-editing prompt and parser**

The service must send one compact JSON context with `request`, `workspace`, and optional `selection`, cap each source file at the validated limits, strip model-supplied IDs, set server-generated `patchId` and `baseCommitSha`, and validate the result with `WorkspacePatch.model_validate()`.

Use these instructions verbatim:

```python
WORKSPACE_INSTRUCTIONS = """You are the Doable static-site source editor. Return ONLY one JSON object with camelCase fields files, summary, and rationale. files may contain only index.html, styles.css, and script.js, and must contain complete replacement contents only for changed files. You may add, remove, or reorder HTML; add complete CSS including media queries and animations; and add browser JavaScript interactions. Preserve behavior unrelated to the request. Do not add remote scripts, network calls, storage or cookie access, service workers, top-window access, inline event-handler attributes, javascript: URLs, or unsupported files. Do not wrap the JSON in prose or markdown."""
```

- [ ] **Step 4: Run Hermes tests**

Run: `cd server && uv run pytest tests/test_workspace_hermes.py -q`

Expected: all tests pass.

- [ ] **Step 5: Commit Hermes workspace editing**

```bash
git add server/app/workspace_hermes.py server/tests/test_workspace_hermes.py server/app/main.py
git commit -m "feat: generate static workspace patches"
```

## Task 5: Add workspace draft and approval APIs

**Files:**

- Modify: `server/app/models.py`
- Modify: `server/app/ledger.py`
- Modify: `server/app/sessions.py`
- Modify: `server/app/main.py`
- Create: `server/tests/test_workspace_sessions.py`

- [ ] **Step 1: Write failing cumulative ledger tests**

```python
def test_workspace_approvals_compose_in_order_and_reset_preserves_repository() -> None:
    store, created, repository = configured_store()
    first = patch("patch-1", {"index.html": "<main>One</main>"})
    store.set_workspace_draft(created.session_id, created.session_token, draft(first))
    first_approval = store.approve_workspace_draft(created.session_id, created.session_token)
    second = patch("patch-2", {"styles.css": "main { color: green; }"})
    store.set_workspace_draft(created.session_id, created.session_token, draft(second))
    second_approval = store.approve_workspace_draft(created.session_id, created.session_token)

    changes = store.get_workspace_changes(created.session_id, created.session_token)
    assert [change.change_id for change in changes] == [
        first_approval.change.change_id,
        second_approval.change.change_id,
    ]
    assert second_approval.ledger_hash != first_approval.ledger_hash

    store.reset_workspace(created.session_id, created.session_token)
    assert store.get_workspace_changes(created.session_id, created.session_token) == []
    assert store.get_status(created.session_id, created.session_token).repository == repository
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd server && uv run pytest tests/test_workspace_sessions.py -q`

Expected: FAIL because workspace draft and approval methods do not exist.

- [ ] **Step 3: Add workspace ledger models and generic hashing**

Add `WorkspaceDraftRequest`, `WorkspaceDraftState`, `ApprovedWorkspaceChange`, `WorkspaceApprovalResponse`, and `WorkspaceChangesResponse`. Update `ledger.change_hash()`, `change_references()`, `ledger_hash()`, `issue_approval()`, and `verify_approval()` to accept either approved model through a shared protocol of `change_id`, `change_hash`, and `model_dump()`.

Add these `SessionState` fields:

```python
workspace_source: StaticSourceWorkspace | None = None
workspace_draft: WorkspaceDraftState | None = None
approved_workspace_changes: list[ApprovedWorkspaceChange] = field(default_factory=list)
workspace_approval: ApprovalRecord | None = None
```

Add authenticated routes:

```text
GET    /v1/sessions/{session_id}/workspace/source
POST   /v1/sessions/{session_id}/workspace/preview
PUT    /v1/sessions/{session_id}/workspace/draft
DELETE /v1/sessions/{session_id}/workspace/draft
POST   /v1/sessions/{session_id}/workspace/changes/approve
GET    /v1/sessions/{session_id}/workspace/changes
```

`reset_workspace()` must clear both legacy and workspace selection/draft/ledger fields while retaining installation and repository.

- [ ] **Step 4: Run session and API tests**

Run: `cd server && uv run pytest tests/test_workspace_sessions.py tests/test_sessions.py tests/test_health.py -q`

Expected: all tests pass.

- [ ] **Step 5: Commit workspace approvals**

```bash
git add server/app/models.py server/app/ledger.py server/app/sessions.py server/app/main.py server/tests/test_workspace_sessions.py
git commit -m "feat: approve static workspace changes"
```

## Task 6: Add the sandboxed full-page browser preview

**Files:**

- Modify: `extension/packages/shared/lib/doable-contracts.ts`
- Create: `extension/pages/content/src/matches/all/workspace-preview.ts`
- Create: `extension/pages/content/src/matches/all/workspace-preview.test.ts`
- Modify: `extension/pages/content/src/matches/all/index.ts`

- [ ] **Step 1: Write failing iframe lifecycle tests**

```ts
import { WorkspacePreviewManager } from './workspace-preview';

it('applies, replaces, and clears one sandboxed preview', () => {
  const manager = new WorkspacePreviewManager(document);
  manager.apply({ patchId: 'one', documentHtml: '<h1>One</h1>', summary: ['One'] });
  const first = document.querySelector<HTMLIFrameElement>('[data-doable-workspace-preview] iframe');
  expect(first?.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-modals');
  expect(first?.srcdoc).toContain('<h1>One</h1>');

  manager.apply({ patchId: 'two', documentHtml: '<h1>Two</h1>', summary: ['Two'] });
  expect(document.querySelectorAll('[data-doable-workspace-preview]')).toHaveLength(1);
  expect(document.querySelector<HTMLIFrameElement>('[data-doable-workspace-preview] iframe')?.srcdoc).toContain('Two');

  manager.clear();
  expect(document.querySelector('[data-doable-workspace-preview]')).toBeNull();
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd extension/pages/content && pnpm test workspace-preview.test.ts`

Expected: FAIL because `WorkspacePreviewManager` does not exist.

- [ ] **Step 3: Implement the overlay and message contracts**

Add `DOABLE_APPLY_WORKSPACE_PREVIEW` and `DOABLE_CLEAR_WORKSPACE_PREVIEW` to `ContentMessage`. Implement a manager that creates one fixed layer at `z-index: 2147483646`, a Doable toolbar above the iframe, a close button, and an iframe with exactly this sandbox value:

```ts
iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
iframe.srcdoc = preview.documentHtml;
```

The manager must replace an existing layer atomically and clear it on `pagehide`. The toolbar must be outside the iframe so preview JavaScript cannot alter it.

- [ ] **Step 4: Run content tests**

Run: `cd extension/pages/content && pnpm test`

Expected: all content tests pass.

- [ ] **Step 5: Commit the sandbox preview**

```bash
git add extension/packages/shared/lib/doable-contracts.ts extension/pages/content/src/matches/all/workspace-preview.ts extension/pages/content/src/matches/all/workspace-preview.test.ts extension/pages/content/src/matches/all/index.ts
git commit -m "feat: preview static workspace in sandbox"
```

## Task 7: Switch the side panel to source-first preview

**Files:**

- Modify: `extension/pages/side-panel/src/server-api.ts`
- Modify: `extension/pages/side-panel/src/server-api.test.ts`
- Modify: `extension/pages/side-panel/src/SidePanel.tsx`
- Modify: `extension/pages/side-panel/src/SidePanel.css`

- [ ] **Step 1: Write failing API tests for workspace preview**

```ts
it('requests a workspace preview and records the approved source draft', async () => {
  const api = authenticatedApi();
  const preview = await api.previewWorkspace('Add a reservation bar');
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('/workspace/preview'),
    expect.objectContaining({ method: 'POST' }),
  );
  expect(preview.patch.files['index.html']).toContain('reservation');

  await api.confirmWorkspacePreview('Add a reservation bar', preview.patch, 'before', 'after');
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('/workspace/draft'),
    expect.objectContaining({ method: 'PUT' }),
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd extension/pages/side-panel && pnpm test src/server-api.test.ts`

Expected: FAIL because workspace API methods do not exist.

- [ ] **Step 3: Add source-first side-panel state and actions**

Add these API methods, plus matching response types:

```ts
async getWorkspaceSource() {
    return this.sessionRequest<StaticSourceWorkspace>('/workspace/source');
}

async previewWorkspace(request: string) {
    return this.sessionRequest<WorkspacePreviewResponse>('/workspace/preview', {
        method: 'POST',
        body: JSON.stringify({ request }),
    });
}

async confirmWorkspacePreview(request: string, patch: WorkspacePatch, beforeScreenshot: string, afterScreenshot: string) {
    return this.sessionRequest('/workspace/draft', {
        method: 'PUT',
        body: JSON.stringify({
            request,
            patch,
            beforeScreenshot,
            afterScreenshot,
            qa: { passed: true, checks: ['sandbox_preview_applied'] },
        }),
    });
}

async approveWorkspaceChange() {
    return this.sessionRequest<WorkspaceApprovalResponse>('/workspace/changes/approve', { method: 'POST' });
}

async getWorkspaceChanges() {
    return (await this.sessionRequest<WorkspaceChangesResponse>('/workspace/changes')).changes;
}

async deleteWorkspaceDraft() {
    await this.sessionRequest('/workspace/draft', { method: 'DELETE' });
}
```

Replace `previewChange()` with a path that:

1. Allows an optional selection but requires `githubStatus.repository`.
2. Calls `previewWorkspace(request)`.
3. Sends `DOABLE_APPLY_WORKSPACE_PREVIEW` to the active tab with `patchId`, `documentHtml`, and `summary`.
4. Captures an after screenshot through a typed background message.
5. Calls `confirmWorkspacePreview()`.
6. Displays changed file names and summary.

Change visible copy to **Preview full page** and show the loaded base SHA. Approval uses workspace changes and stores the returned workspace approval token under the existing per-session local key.

- [ ] **Step 4: Run side-panel tests and build**

Run: `cd extension && pnpm --filter @extension/sidepanel test && pnpm --filter @extension/sidepanel type-check && CI=1 TURBO_UI=stream pnpm build`

Expected: tests, type-check, and all build tasks pass.

- [ ] **Step 5: Commit the source-first UI**

```bash
git add extension/pages/side-panel/src/server-api.ts extension/pages/side-panel/src/server-api.test.ts extension/pages/side-panel/src/SidePanel.tsx extension/pages/side-panel/src/SidePanel.css
git commit -m "feat: use full-page source previews"
```

## Task 8: Release approved files without source mapping

**Files:**

- Modify: `server/app/sessions.py`
- Modify: `server/app/release_service.py`
- Modify: `server/app/main.py`
- Create: `server/tests/test_workspace_release.py`

- [ ] **Step 1: Write failing exact-file release tests**

```python
@pytest.mark.asyncio
async def test_workspace_release_writes_exact_approved_files_in_order() -> None:
    snapshot = workspace_snapshot(
        base_sha="base-sha",
        changes=[
            approved_patch("one", {"index.html": "<main>One</main>"}),
            approved_patch("two", {"styles.css": "main { color: green; }", "script.js": "console.log('ready')"}),
        ],
    )
    client = RecordingClient(base_sha="base-sha")

    result = await ReleaseService().release_workspace(snapshot, client)

    assert client.created_trees == [
        {"index.html": "<main>One</main>"},
        {"styles.css": "main { color: green; }", "script.js": "console.log('ready')"},
    ]
    assert len(result.commit_shas) == 2
    assert client.created_pull_request is True


@pytest.mark.asyncio
async def test_workspace_release_blocks_when_base_branch_moved() -> None:
    snapshot = workspace_snapshot(base_sha="approved-base", changes=[approved_patch("one", {"index.html": "New"})])
    with pytest.raises(ReleaseBlocked, match="default branch moved"):
        await ReleaseService().release_workspace(snapshot, RecordingClient(base_sha="current-base"))
```

- [ ] **Step 2: Run the release tests and verify RED**

Run: `cd server && uv run pytest tests/test_workspace_release.py -q`

Expected: FAIL because `release_workspace()` does not exist.

- [ ] **Step 3: Implement direct workspace release**

Add `WorkspaceReleaseSnapshot` with `base_commit_sha`, ordered approved workspace changes, repository, and ledger hash. `prepare_workspace_release()` verifies the workspace approval token and exact change IDs.

`release_workspace()` must:

1. Compare `client.get_ref(default_branch)` with `snapshot.base_commit_sha` before any write.
2. Get the base commit tree.
3. For each approved change, call `create_tree()` with exactly `change.workspace_patch.files`.
4. Create one commit per change, chaining parents.
5. Recheck the default branch before creating the release ref.
6. Reuse the deterministic branch and open PR behavior already used by legacy release.
7. Persist and cache the result under the same installation/repository/ledger key.

Update `/release` to select the workspace snapshot when workspace approvals exist; otherwise retain legacy behavior for old records.

- [ ] **Step 4: Run all server tests**

Run: `cd server && uv run pytest -q`

Expected: all tests pass.

- [ ] **Step 5: Commit exact workspace release**

```bash
git add server/app/sessions.py server/app/release_service.py server/app/main.py server/tests/test_workspace_release.py
git commit -m "feat: release approved static workspace files"
```

## Task 9: Verify the complete demo workflow

**Files:**

- Modify: `docs/superpowers/specs/2026-07-12-full-page-static-editing-design.md`
- Modify: `README.md`

- [ ] **Step 1: Run all automated checks**

```bash
cd server && uv run pytest -q
cd ../extension && pnpm --filter chrome-extension test
pnpm --filter @extension/content-script test
pnpm --filter @extension/sidepanel test
pnpm type-check
CI=1 TURBO_UI=stream pnpm build
```

Expected: every suite and all build tasks pass.

- [ ] **Step 2: Run the local backend and reload the unpacked extension**

Run: `docker build -t doable-server:local .`

Update and restart the existing local container without changing its environment or mounts:

```bash
docker cp server/app/. doable-server:/opt/doable/app/
docker restart doable-server
curl --fail http://127.0.0.1:8787/health
curl --fail http://127.0.0.1:8787/v1/hermes/status
```

Reload `extension/dist` from `chrome://extensions`.

- [ ] **Step 3: Execute the seeded full-page request**

Use this exact manager request against `doable-demo-site`:

```text
Add a fixed mobile reservation bar below 640px with a Reserve a seat button. Style it with the existing red signal color, and make the button open the existing reservation dialog.
```

Verify:

- The sandbox iframe contains the new HTML bar.
- The bar appears only below 640 px.
- The button opens the reservation dialog inside the sandbox.
- Closing the preview restores the untouched deployed page.
- Approval records changed `index.html`, `styles.css`, and `script.js` files.
- The created pull request diff matches the approved files exactly.

- [ ] **Step 4: Update documentation with verified limits**

Add this section to `README.md` after live verification:

```markdown
## Full-page static editing

Doable supports source-first changes to root `index.html`, `styles.css`, and `script.js`. HTML, CSS, and JavaScript run in a sandboxed iframe during preview; the deployed page is not mutated. Preview JavaScript cannot use cookies, browser storage, service workers, top-window access, or network APIs. Approval stores exact file contents and the repository base SHA. Release stops with `base_branch_moved` if the default branch changed before Doable writes its deterministic pull-request branch.

Demo request: "Add a fixed mobile reservation bar below 640px with a Reserve a seat button. Style it with the existing red signal color, and make the button open the existing reservation dialog."
```

Change the design status to `Implemented and live-verified` only after the live pull request passes all Step 3 checks.

- [ ] **Step 5: Commit verified documentation**

```bash
git add README.md docs/superpowers/specs/2026-07-12-full-page-static-editing-design.md
git commit -m "docs: document full-page static editing"
```
