# Doable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Doable, a Chrome side-panel AI UI engineering agency that previews reversible changes in the active browser tab and converts only approved changes into a GitHub pull request through Hermes.

**Architecture:** The repository has two independent applications: `extension/`, pinned from release `0.5.2` of the React/Vite Chrome extension boilerplate, and `server/`, a FastAPI service that owns Hermes, Supermemory, approval state, and GitHub access. The demo website remains a separate repository and later joins the VS Code workspace as an external integration target.

**Tech Stack:** Chrome Manifest V3, React 19, TypeScript, Vite 6, pnpm 10, Turborepo, Vitest, WebdriverIO, Python 3.12, FastAPI, Pydantic, pytest, Hermes Agent, Supermemory, GitHub REST/Git Data API.

---

## Repository Structure

```text
doable/
  extension/                         # Pinned and trimmed React/Vite extension starter
    chrome-extension/                # Manifest and background service worker
    pages/content/                   # Element selection and browser-only patch engine
    pages/side-panel/                # Doable management UI
    packages/shared/                 # Extension contracts shared by all contexts
    tests/e2e/                       # Loaded-extension browser tests
  server/
    app/main.py                      # FastAPI routes, health, WebSocket sessions
    app/models.py                    # API and approved-change models
    app/hermes_service.py            # Hermes manager and specialist orchestration
    app/memory_policy.py             # Supermemory scope, consent, redaction
    app/ledger.py                    # Immutable approval hashes
      app/github_app.py                # GitHub App installation and token lifecycle
    app/github_client.py             # Repository and Git Data API operations
    app/release_service.py           # Approved browser change to source patch
    tests/                           # Server unit and integration tests
  hermes-plugin/                     # Narrow Doable tools loaded by Hermes
  config/supermemory.example.json    # Non-secret provider configuration
  docs/                              # Specifications, setup, and judging runbook
```

The external demo repository is not created or nested here. Its only contract with Doable is a public website URL, GitHub repository identity, and stable `data-doable-id` values used by the buildathon fixture.

## Task 1: Initialize the Repository and Application Skeletons

**Files:**

- Import into: `extension/`
- Create: `server/pyproject.toml`
- Create: `server/app/__init__.py`
- Create: `server/app/main.py`
- Create: `server/tests/test_health.py`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Initialize the root Git repository**

Run: `git init -b main`

Expected: The current workspace becomes the Doable repository. Do not commit yet.

- [ ] **Step 2: Import the pinned extension starter**

Run:

```bash
git clone --depth 1 --branch 0.5.2 \
  https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite.git extension
rm -rf extension/.git
```

Expected: `extension/package.json` reports pnpm `10.11.0`, Node `>=22.15.1`, and the upstream MIT `LICENSE` remains present. The nested Git history is removed so the root repository owns the files.

- [ ] **Step 3: Repair the archived dependency graph**

The archived lockfile references npm releases that no longer exist. Delete `extension/pnpm-lock.yaml`, pin `eslint-config-prettier` to `10.1.8` and `vite-plugin-node-polyfills` to `0.23.0`, then add `packages/vite-config/node-polyfills.d.ts` to the package's TypeScript include list. Use relative imports inside `packages/ui` so consumer packages can type-check UI source without inheriting its private `@/` alias.

Run: `cd extension && corepack enable && pnpm install && pnpm type-check && pnpm build`

Expected: PASS, create a new valid lockfile, and emit the unpacked extension under `extension/dist`.

- [ ] **Step 4: Write the failing server health test**

```python
from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_ok() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 5: Run the server test and verify it fails**

Run: `cd server && uv run pytest tests/test_health.py -q`

Expected: FAIL because `app.main` does not exist.

- [ ] **Step 6: Add the minimal FastAPI server**

Create `server/pyproject.toml` with Python `>=3.12`, FastAPI, Uvicorn, HTTPX, Pydantic, pytest, and pytest-asyncio. Implement:

```python
from fastapi import FastAPI

app = FastAPI(title="Doable Server")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Verify both application baselines**

Run: `cd server && uv run pytest -q && cd ../extension && pnpm type-check && pnpm build`

Expected: Server tests PASS; extension type-check and production build PASS.

- [ ] **Step 8: Commit the initialized repository**

Run: `git add . && git commit -m "chore: initialize doable applications"`

Expected: One root commit containing the pinned starter, server health endpoint, documents, and preserved upstream license.

## Task 2: Trim and Brand the Extension Starter

**Files:**

- Modify: `extension/package.json`
- Modify: `extension/chrome-extension/manifest.ts`
- Modify: `extension/packages/i18n/locales/en/messages.json`
- Remove through module manager: unused pages and runtime modules
- Preserve: `extension/LICENSE`

- [ ] **Step 1: Record the baseline manifest assertions**

Add a manifest test asserting the extension name is `Doable`, `side_panel.default_path` exists, and permissions contain only `storage`, `scripting`, `tabs`, `activeTab`, and `sidePanel`.

- [ ] **Step 2: Run the manifest test and verify it fails on starter branding and permissions**

Run: `cd extension && pnpm type-check && pnpm test -- manifest`

Expected: FAIL because the starter manifest still includes example branding and unused permissions.

- [ ] **Step 3: Remove unused starter modules non-interactively**

Run:

```bash
cd extension
pnpm module-manager -d popup new-tab options devtools content-ui content-runtime
```

Expected: The side panel, background, plain content script, shared packages, build tooling, and WebdriverIO E2E workspace remain. Popup, new-tab, options, DevTools, injected React UI, and runtime content are removed.

- [ ] **Step 4: Remove starter-only maintenance infrastructure**

Run:

```bash
cd extension
rm -rf .github .husky packages/module-manager
rm -f .gitguardian.yaml UPDATE-PACKAGE-VERSIONS.md bash-scripts/update_version.sh
```

Remove the matching module-manager, Husky, lint-staged, version-update, and Firefox scripts/dependencies from `extension/package.json`, then run `pnpm install --no-frozen-lockfile`.

- [ ] **Step 5: Apply Doable branding and minimum permissions**

Keep Chrome-only Manifest V3 support. Set the extension name and description to Doable, preserve `sidePanel`, remove notification and Firefox-only settings, and limit host access to `http://*/*` and `https://*/*` for the buildathon prototype. Delete the starter `example` content entry and sample function.

- [ ] **Step 6: Verify the trimmed extension**

Run: `cd extension && pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm build`

Expected: PASS and `dist/manifest.json` contains the Doable name, side panel, background worker, and content script only.

- [ ] **Step 7: Commit the trimmed starter**

Run: `git add extension && git commit -m "chore: trim and brand extension starter"`

## Task 3: Build Element Selection and Reversible Browser Preview

**Files:**

- Create: `extension/packages/shared/lib/doable-contracts.ts`
- Create: `extension/pages/content/src/matches/all/preview-patches.ts`
- Modify: `extension/pages/content/src/matches/all/index.ts`
- Modify: `extension/chrome-extension/src/background/index.ts`
- Test: `extension/pages/content/src/matches/all/preview-patches.test.ts`

- [ ] **Step 1: Write a failing test for apply and undo**

Test that a patch changes the selected element's text and CSS, records the original values, and restores them exactly on undo. Also test rejection when a selector resolves to zero or multiple elements.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd extension && pnpm --filter content-script test -- preview-patches.test.ts`

Expected: FAIL because the patch engine does not exist.

- [ ] **Step 3: Define stable browser contracts**

Define `SelectedComponent`, `PreviewPatch`, `ApprovedChange`, and extension message unions. A `PreviewPatch` permits text, non-event attributes, selected-element styles, and direct-parent styles only. It cannot contain scripts or event handlers.

- [ ] **Step 4: Implement selection mode and reversible patches**

Use a content-script overlay for hover and click selection. Capture `data-doable-id`, a stable selector, nearby HTML, an allowlisted computed-style map, URL, and viewport. Maintain a patch stack keyed by `patchId`; restore the exact original text, attributes, and `style` attribute on undo or disconnect.

- [ ] **Step 5: Verify content behavior and extension build**

Run: `cd extension && pnpm --filter content-script test -- preview-patches.test.ts && pnpm type-check && pnpm build`

Expected: PASS. Reloading the target page clears all temporary preview mutations.

- [ ] **Step 6: Commit the browser preview engine**

Run: `git add extension && git commit -m "feat: add reversible browser previews"`

## Task 4: Add Server Sessions and the Approval Ledger

**Files:**

- Create: `server/app/models.py`
- Create: `server/app/sessions.py`
- Create: `server/app/ledger.py`
- Modify: `server/app/main.py`
- Test: `server/tests/test_ledger.py`
- Test: `server/tests/test_sessions.py`

- [ ] **Step 1: Write failing approval tests**

Test that approval binds a SHA-256 hash of the exact ordered changes, and that missing, reordered, or modified changes fail release verification.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd server && uv run pytest tests/test_ledger.py tests/test_sessions.py -q`

Expected: FAIL because the ledger and WebSocket session broker do not exist.

- [ ] **Step 3: Implement typed models and immutable approvals**

Use Pydantic models matching the extension contracts. Serialize approved changes with stable sorted keys. Store opaque approval tokens server-side and bind them to one workspace plus the ordered ledger hash.

- [ ] **Step 4: Implement extension-server transport**

Expose `/v1/extension/{session_id}` as the background worker's WebSocket and routes for selection, preview state, approval, and release verification. Authenticate the extension session with an ephemeral server-issued token. Never send Hermes, Supermemory, or GitHub credentials to the extension.

- [ ] **Step 5: Verify the server slice**

Run: `cd server && uv run pytest tests/test_ledger.py tests/test_sessions.py -q`

Expected: PASS, including rejection after ledger tampering.

- [ ] **Step 6: Commit sessions and approvals**

Run: `git add server && git commit -m "feat: add sessions and approval ledger"`

## Task 5: Integrate Hermes and Scoped Supermemory

**Files:**

- Create: `server/app/hermes_service.py`
- Create: `server/app/memory_policy.py`
- Create: `server/tests/test_memory_policy.py`
- Create: `hermes-plugin/plugin.yaml`
- Create: `hermes-plugin/__init__.py`
- Create: `hermes-plugin/tests/test_plugin.py`
- Create: `config/supermemory.example.json`
- Create: `docs/supermemory-setup.md`

- [ ] **Step 1: Write failing plugin and memory policy tests**

Test registration of only these tools: `get_selected_component`, `apply_preview_patch`, `capture_preview_state`, `record_approved_change`, `get_repository_context`, and `create_pull_request`. Test opt-in memory, unique workspace profiles/containers, secret redaction, and non-blocking provider failure.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd server && uv run pytest tests/test_memory_policy.py -q && cd ../hermes-plugin && uv run pytest tests/test_plugin.py -q`

Expected: FAIL because the Hermes service, plugin, and memory policy do not exist.

- [ ] **Step 3: Implement the Hermes manager and specialists**

Run Hermes as the load-bearing manager agent. Its prompt requires: inspect selection, delegate to UI editor and visual QA, apply a browser-only preview, wait for approval, and release approved entries only. Disable unrestricted terminal and filesystem tools for user-facing runs.

- [ ] **Step 4: Implement Supermemory isolation**

Derive an opaque profile/container ID with HMAC-SHA256 over manager and repository IDs. Use one Hermes profile and one primary `doable-{identity}` container per workspace. Capture only after explicit consent. Redact tokens, credentials, PEM blocks, full HTML, raw files, and screenshots. When Supermemory fails or consent is off, continue with a `memory_unavailable` or `memory_skipped` trace event.

- [ ] **Step 5: Configure and verify the native provider**

Run:

```bash
pip install supermemory
hermes profile create doable-demo
hermes -p doable-demo memory setup
hermes -p doable-demo memory status
```

Expected: The demo profile reports Supermemory active. The API key exists only in the profile environment.

- [ ] **Step 6: Verify Hermes tools and memory tests**

Run: `cd server && uv run pytest tests/test_memory_policy.py -q && cd ../hermes-plugin && uv run pytest tests/test_plugin.py -q`

Expected: PASS, including an approval rejection before any GitHub tool call.

- [ ] **Step 7: Commit Hermes and memory integration**

Run: `git add server hermes-plugin config docs/supermemory-setup.md && git commit -m "feat: add hermes agency and workspace memory"`

## Task 6: Build the Side Panel Control Surface

**Files:**

- Modify: `extension/pages/side-panel/src/SidePanel.tsx`
- Modify: `extension/pages/side-panel/src/SidePanel.css`
- Create: `extension/pages/side-panel/src/server-api.ts`
- Test: `extension/pages/side-panel/src/SidePanel.test.tsx`

- [ ] **Step 1: Write failing operator-flow tests**

Test that release is disabled with no approved changes, approval adds exactly one ledger item, undo removes only the active draft, memory defaults off, GitHub starts disconnected, and server unavailability keeps existing browser previews intact.

- [ ] **Step 2: Run the side-panel tests and verify RED**

Run: `cd extension && pnpm --filter side-panel test -- SidePanel.test.tsx`

Expected: FAIL because the starter panel does not implement Doable.

- [ ] **Step 3: Implement the side panel**

Build, in order: Connect GitHub action, connected-account status, connected-repository picker and disconnect action, website connection status, select-element control, selected component summary, Hermes chat and trace, preview review actions, approved-change ledger, opt-in memory status, clear-memory action, release button, and PR result. `Connect GitHub` requests an installation URL from the Doable server and opens it with `chrome.tabs.create`; credentials never enter extension state. The extension speaks only to the Doable server.

- [ ] **Step 4: Verify UI tests and the production bundle**

Run: `cd extension && pnpm --filter side-panel test -- SidePanel.test.tsx && pnpm lint && pnpm type-check && pnpm build`

Expected: PASS and emit a loadable `extension/dist`.

- [ ] **Step 5: Commit the operator UI**

Run: `git add extension && git commit -m "feat: add doable side panel"`

## Task 7: Translate Approved Changes and Open GitHub Pull Requests

**Files:**

- Create: `server/app/github_app.py`
- Create: `server/app/github_client.py`
- Create: `server/app/release_service.py`
- Modify: `server/app/main.py`
- Test: `server/tests/test_github_app.py`
- Test: `server/tests/test_release_service.py`
- Test: `server/tests/test_github_client.py`

- [ ] **Step 1: Write failing release tests**

Use static HTML/CSS strings as fixtures inside tests, not a nested demo repository. Test exact `data-doable-id` mapping, text and CSS translation, duplicate/absent marker rejection, and zero GitHub writes when approval is invalid. Test signed installation state, callback state rejection, repository allowlisting, one-hour token non-persistence, disconnect behavior, default-branch movement, idempotent release retries, and one ordered commit per approved ledger entry.

- [ ] **Step 2: Run release tests and verify RED**

Run: `cd server && uv run pytest tests/test_github_app.py tests/test_release_service.py tests/test_github_client.py -q`

Expected: FAIL because GitHub App connection, release translation, and GitHub operations do not exist.

- [ ] **Step 3: Implement deterministic buildathon translation**

For v1, inspect only the connected repository's `index.html` and `styles.css`. Require exactly one matching `data-doable-id`. Apply approved text, non-event attributes, and CSS declarations only. Return `source_mapping_not_found`, `source_mapping_ambiguous`, or `unsupported_change` instead of guessing.

- [ ] **Step 4: Implement GitHub App connection**

Register a GitHub App with **Metadata: read**, **Contents: read and write**, and **Pull requests: read and write**. Keep webhooks disabled for v1. Implement:

- `POST /v1/github/install/start` to create a short-lived signed state bound to the Doable session and return the installation URL.
- `GET /v1/github/callback` to validate state and persist the installation ID/account binding.
- `GET /v1/github/status` for connection state.
- `GET /v1/github/repositories` to list only repositories granted to the installation.
- `PUT /v1/github/repository` to bind one granted repository to the workspace.
- `DELETE /v1/github/repository` to remove the local workspace binding without uninstalling the App.

Generate an installation access token only when making a GitHub request. Restrict it to the bound repository, keep it in memory for at most its one-hour lifetime, and never return or persist it.

- [ ] **Step 5: Implement server-side GitHub release**

Read the selected repository's metadata, default-branch ref, base commit, base tree, and required source files. Translate the complete approved ledger before any write and present the source diff. On release approval, create one tree and commit per approved ledger entry in order, chaining each commit to the previous one. Create a unique `doable/<change-set-id>` ref pointing to the final commit, then open the PR. Never force-update an existing ref, write to the default branch, or merge. Include approved change IDs, commit SHAs, QA results, and memory-derived conventions in the PR body.

Bind release idempotency to the approved ledger hash. A retry returns the existing branch/PR. Re-read the default-branch SHA immediately before writes and return `base_branch_moved` if it differs from the translation base.

- [ ] **Step 6: Verify release behavior**

Run: `cd server && uv run pytest tests/test_github_app.py tests/test_release_service.py tests/test_github_client.py -q`

Expected: PASS with no write calls for invalid approval, blocked source mapping, unbound repositories, callback state mismatch, or moved default branches.

- [ ] **Step 7: Commit GitHub release support**

Run: `git add server && git commit -m "feat: release approved changes as pull requests"`

## Task 8: Add Visual QA, Observability, and Cross-Repository Demo Tests

**Files:**

- Create: `server/app/qa_service.py`
- Create: `server/app/run_store.py`
- Test: `server/tests/test_qa_service.py`
- Test: `server/tests/test_run_store.py`
- Create: `extension/tests/e2e/specs/doable-flow.spec.ts`
- Create: `docs/demo-script.md`

- [ ] **Step 1: Write failing QA and trace tests**

Test that unchanged screenshots fail QA, console errors block approval, and the run store returns ordered manager, inspector, editor, QA, memory, and release events.

- [ ] **Step 2: Run server tests and verify RED**

Run: `cd server && uv run pytest tests/test_qa_service.py tests/test_run_store.py -q`

Expected: FAIL because QA and run storage do not exist.

- [ ] **Step 3: Implement QA and persisted traces**

Require a changed selected region, readable visible text for copy edits, no horizontal overflow, and no new console error. Persist role, tool, input/output summaries, duration, outcome, token/cost data when Hermes provides it, and memory status. Expose a run-detail endpoint for the side panel.

- [ ] **Step 4: Add the external demo repository test contract**

Read `DEMO_URL`, `DEMO_REPOSITORY`, and `DOABLE_SERVER_URL` from the test environment. Fail clearly if any are absent. Do not clone, embed, or mutate the demo repository in this repository's test setup.

- [ ] **Step 5: Run three judge flows against the external demo repository**

Verify: CTA copy/contrast, highlighted pricing card, and mobile spacing. For each, assert temporary preview, undo, approval, QA, one ledger entry, and a GitHub PR containing only approved source changes. Run a second request that recalls an approved preference from Supermemory.

- [ ] **Step 6: Run final verification**

Run:

```bash
cd server && uv run pytest -q
cd ../extension && pnpm lint && pnpm type-check && pnpm build && pnpm e2e
```

Expected: All server tests, extension checks, bundle build, and loaded-extension E2E tests PASS.

- [ ] **Step 7: Commit demo readiness**

Run: `git add server extension docs/demo-script.md && git commit -m "test: verify doable end to end"`

## Plan Self-Review

- Spec coverage: browser-only previews, approval ledger, Hermes agent org, Supermemory, side-panel management, GitHub PR release, visual QA, and judge traces all have implementation and verification tasks.
- Repository boundary: no demo site files, deployment configuration, or nested demo checkout exist in this repository.
- Starter compatibility: paths follow the pinned React/Vite starter's `chrome-extension`, `pages`, `packages`, and `tests` layout; WXT assumptions were removed.
- Scope: the architecture can later add framework-aware release adapters, while the buildathon implementation guarantees deterministic static HTML/CSS translation only.
- Security: credentials stay server-side; memory is opt-in and isolated; release is approval-bound; the PR tool cannot merge.
