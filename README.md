# Doable

Doable is a Chrome side-panel AI UI engineering agency. It previews reversible HTML and CSS changes in the active browser tab, then uses Hermes to translate only approved changes into a GitHub pull request.

## Full-Page Static Editing

Doable supports source-first changes to root `index.html`, `styles.css`, and `script.js`. It can add, remove, and reorder HTML; add complete CSS rules, media queries, and animations; and add browser JavaScript interactions. Selection is optional context, and full-page edits do not require `data-doable-id` source markers.

HTML, CSS, and JavaScript run in a sandboxed iframe during preview; the deployed page is not mutated. Preview JavaScript cannot use cookies, browser storage, service workers, top-window access, or network APIs. Approval stores exact file contents and the repository base SHA. Release stops with `base_branch_moved` if the default branch changes before Doable writes its deterministic pull-request branch.

Verified demo request:

> Add a fixed mobile reservation bar below 640px with a Reserve a seat button. Style it with the existing red signal color, and make the button open the existing reservation dialog.

The live verification created [doable-demo-site PR #2](https://github.com/kunalshah017/doable-demo-site/pull/2) with exactly one approved commit touching only `index.html` and `styles.css`.

## Repository

- `extension/` contains the React, Vite, and Manifest V3 browser extension.
- `server/` contains the FastAPI service, Hermes orchestration, Supermemory policy, and GitHub integration.
- `docs/` contains the approved product specification and implementation plan.

The demo website lives in a separate repository and will be added to the VS Code workspace later.

## Baseline Commands

```bash
cd extension
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

```bash
cd server
uv run pytest -q
uv run uvicorn app.main:app --reload --port 8787
```

The extension is based on release `0.5.2` of `Jonghakseo/chrome-extension-boilerplate-react-vite`. Its MIT license is preserved in `extension/LICENSE`.

## Single-Container Deployment

The root `Dockerfile` extends the official Hermes image and runs both services:

- Hermes API gateway privately on `127.0.0.1:8642`
- Doable FastAPI publicly on `$PORT`

Deploy the repository as a Docker web service using `render.yaml`, or use the same image on any container host. Configure the environment variables listed in `server/.env.example`. The extension should set `CEB_SERVER_URL` to the deployed FastAPI origin before building.
