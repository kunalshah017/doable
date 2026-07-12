import { readFileSync } from 'node:fs';
import type { ManifestType } from '@extension/shared';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

const manifest = {
  manifest_version: 3,
  name: 'Doable',
  version: packageJson.version,
  description: 'Preview website changes with a Hermes-powered engineering agency',
  host_permissions: ['<all_urls>'],
  permissions: ['activeTab', 'storage', 'scripting', 'tabs', 'sidePanel'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  action: {
    default_icon: {
      '128': 'icon-128.png',
    },
    default_title: 'Open Doable',
  },
  icons: {
    '128': 'icon-128.png',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['content/all.iife.js'],
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      css: ['content.css'],
    },
  ],
  web_accessible_resources: [
    {
      resources: ['*.js', '*.css', '*.svg', 'icon-128.png'],
      matches: ['*://*/*'],
    },
  ],
  side_panel: {
    default_path: 'side-panel/index.html',
  },
} satisfies ManifestType;

export default manifest;
