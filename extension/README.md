# Doable Extension

Doable uses a Chrome side panel for the manager interface and a content script for inspect-style element selection and temporary page previews.

## Runtime Shape

- `chrome-extension/` builds the Manifest V3 background service worker and manifest.
- `pages/side-panel/` contains the persistent manager-facing chat and review UI.
- `pages/content/` runs in web pages, outlines hovered elements, captures selected DOM context, and applies reversible preview patches.
- `packages/` contains shared build, storage, UI, and contract code.
- `tests/e2e/` contains loaded-extension browser tests.

The side panel never accesses page DOM directly. It sends commands through the background worker to the content script in the active tab. Credentials remain on the Doable server and are never stored in the extension.

## Develop

Requires Node.js `>=22.15.1` and pnpm `10.11.0`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`.

## Verify

```bash
pnpm lint
pnpm type-check
pnpm build
```

This project is based on release `0.5.2` of `Jonghakseo/chrome-extension-boilerplate-react-vite`. The upstream MIT license is preserved in `LICENSE`.
