declare module 'vite-plugin-node-polyfills' {
  import type { PluginOption } from 'vite';

  export function nodePolyfills(): PluginOption;
}