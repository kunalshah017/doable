import { WorkspacePreviewManager } from './workspace-preview';
import { beforeEach, expect, it } from 'vitest';

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body><main>Live page</main></body>';
});

it('applies, replaces, and clears one sandboxed preview', () => {
  const manager = new WorkspacePreviewManager(document);

  manager.apply({
    patchId: 'one',
    documentHtml: '<h1>One</h1>',
    summary: ['First preview'],
  });
  const first = document.querySelector<HTMLIFrameElement>('[data-doable-workspace-preview] iframe');
  expect(first?.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-modals');
  expect(first?.srcdoc).toContain('<h1>One</h1>');
  expect(document.body.textContent).toContain('First preview');

  manager.apply({
    patchId: 'two',
    documentHtml: '<h1>Two</h1>',
    summary: ['Second preview'],
  });
  expect(document.querySelectorAll('[data-doable-workspace-preview]')).toHaveLength(1);
  expect(document.querySelector<HTMLIFrameElement>('[data-doable-workspace-preview] iframe')?.srcdoc).toContain(
    '<h1>Two</h1>',
  );

  manager.clear();
  expect(document.querySelector('[data-doable-workspace-preview]')).toBeNull();
  expect(document.body.textContent).toContain('Live page');
});

it('keeps the close control outside the preview iframe', () => {
  const manager = new WorkspacePreviewManager(document);
  manager.apply({
    patchId: 'one',
    documentHtml: '<button>Page button</button>',
    summary: ['Preview ready'],
  });

  const close = document.querySelector<HTMLButtonElement>('[data-doable-workspace-preview] > button');
  expect(close).not.toBeNull();

  close?.click();

  expect(document.querySelector('[data-doable-workspace-preview]')).toBeNull();
});
