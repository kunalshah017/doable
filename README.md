# Doable

Doable is a Chrome side-panel AI UI engineering agency. It previews reversible HTML and CSS changes in the active browser tab, then uses Hermes to translate only approved changes into a GitHub pull request.

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
