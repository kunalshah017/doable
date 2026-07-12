import { PreviewPatchManager } from './preview-patches';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PreviewPatch } from '@extension/shared';

const unsafeChanges: Array<Partial<PreviewPatch>> = [
  { attributes: { onclick: 'alert(1)' } },
  { attributes: { href: 'javascript:alert(1)' } },
  { styles: { background: 'url(javascript:alert(1))' } },
  { text: '<script>alert(1)</script>' },
];

describe('PreviewPatchManager', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main style="display: grid">
        <button data-doable-id="save" class="primary" aria-label="Save" style="color: red">Save now</button>
      </main>
    `;
  });

  it('applies target and direct-parent changes, then restores exact originals on undo', () => {
    const manager = new PreviewPatchManager(document);
    const target = document.querySelector<HTMLElement>('[data-doable-id="save"]')!;
    const parent = target.parentElement!;

    manager.apply('[data-doable-id="save"]', {
      patchId: 'patch-1',
      selectionId: 'selection-1',
      text: 'Ship it',
      attributes: { class: 'primary ready', 'aria-label': null, title: 'Ready' },
      styles: { color: 'blue', padding: '8px' },
      parentStyles: { display: 'flex', gap: '4px' },
      rationale: 'Make the action clearer',
    });

    expect(target.textContent).toBe('Ship it');
    expect(target.getAttribute('class')).toBe('primary ready');
    expect(target.hasAttribute('aria-label')).toBe(false);
    expect(target.getAttribute('title')).toBe('Ready');
    expect(target.style.color).toBe('blue');
    expect(target.style.padding).toBe('8px');
    expect(parent.style.display).toBe('flex');
    expect(parent.style.gap).toBe('4px');

    manager.undo('patch-1');

    expect(target.textContent).toBe('Save now');
    expect(target.getAttribute('class')).toBe('primary');
    expect(target.getAttribute('aria-label')).toBe('Save');
    expect(target.hasAttribute('title')).toBe(false);
    expect(target.getAttribute('style')).toBe('color: red');
    expect(parent.getAttribute('style')).toBe('display: grid');
  });

  it('applies and undoes a text-only patch when mutation maps are omitted', () => {
    const manager = new PreviewPatchManager(document);
    const target = document.querySelector<HTMLElement>('[data-doable-id="save"]')!;
    const originalDom = target.outerHTML;

    manager.apply('[data-doable-id="save"]', {
      patchId: 'patch-text-only',
      selectionId: 'selection-1',
      text: 'Ship it',
      rationale: 'Make the action clearer',
    });

    expect(target.textContent).toBe('Ship it');

    manager.undo('patch-text-only');

    expect(target.outerHTML).toBe(originalDom);
  });

  it('undoes the latest patch without disturbing the older patch, then clears exact originals', () => {
    document.body.innerHTML = '<section><p id="target">Original</p></section>';
    const manager = new PreviewPatchManager(document);
    const target = document.querySelector<HTMLElement>('#target')!;
    const parent = target.parentElement!;

    manager.apply('#target', {
      patchId: 'patch-1',
      selectionId: 'selection-1',
      text: 'First',
      attributes: {},
      styles: { color: 'red' },
      parentStyles: { display: 'flex' },
      rationale: 'First draft',
    });
    manager.apply('#target', {
      patchId: 'patch-2',
      selectionId: 'selection-1',
      text: 'Second',
      attributes: {},
      styles: { color: 'blue' },
      parentStyles: { display: 'grid' },
      rationale: 'Second draft',
    });

    manager.undo('patch-2');

    expect(target.textContent).toBe('First');
    expect(target.style.color).toBe('red');
    expect(parent.style.display).toBe('flex');

    manager.clear();

    expect(target.textContent).toBe('Original');
    expect(target.hasAttribute('style')).toBe(false);
    expect(parent.hasAttribute('style')).toBe(false);
  });

  it('preserves newer overlapping changes when undoing an older patch, then clears to the exact original DOM', () => {
    const manager = new PreviewPatchManager(document);
    const target = document.querySelector<HTMLElement>('[data-doable-id="save"]')!;
    const parent = target.parentElement!;
    const originalDom = parent.outerHTML;

    manager.apply('[data-doable-id="save"]', {
      patchId: 'patch-1',
      selectionId: 'selection-1',
      text: 'First draft',
      attributes: { class: 'primary first', 'aria-label': 'First action' },
      styles: { color: 'orange', padding: '4px' },
      parentStyles: { display: 'flex', gap: '4px' },
      rationale: 'First draft',
    });
    manager.apply('[data-doable-id="save"]', {
      patchId: 'patch-2',
      selectionId: 'selection-1',
      text: 'Latest draft',
      attributes: { class: 'primary latest', 'aria-label': null, title: 'Latest action' },
      styles: { color: 'blue', padding: '8px' },
      parentStyles: { display: 'block', gap: '12px' },
      rationale: 'Latest draft',
    });

    manager.undo('patch-1');

    expect(target.textContent).toBe('Latest draft');
    expect(target.getAttribute('class')).toBe('primary latest');
    expect(target.hasAttribute('aria-label')).toBe(false);
    expect(target.getAttribute('title')).toBe('Latest action');
    expect(target.style.color).toBe('blue');
    expect(target.style.padding).toBe('8px');
    expect(parent.style.display).toBe('block');
    expect(parent.style.gap).toBe('12px');

    manager.clear();

    expect(parent.outerHTML).toBe(originalDom);
  });

  it('applies a patch to an open shadow-DOM descendant', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.querySelector<HTMLElement>('#host')!;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<button data-doable-id="shadow-action">Original</button>';
    const manager = new PreviewPatchManager(document);

    manager.apply('#host >>> [data-doable-id="shadow-action"]', {
      patchId: 'patch-shadow',
      selectionId: 'selection-shadow',
      text: 'Preview',
      attributes: {},
      styles: {},
      parentStyles: {},
      rationale: 'Preview a shadow descendant',
    });

    expect(shadowRoot.querySelector('button')?.textContent).toBe('Preview');
    manager.undo('patch-shadow');
    expect(shadowRoot.querySelector('button')?.textContent).toBe('Original');
  });

  it.each(['.missing', 'button'])('rejects selectors that do not resolve to exactly one element: %s', selector => {
    const manager = new PreviewPatchManager(document);

    if (selector === 'button') {
      document.body.insertAdjacentHTML('beforeend', '<button>Another</button>');
    }

    expect(() =>
      manager.apply(selector, {
        patchId: 'patch-1',
        selectionId: 'selection-1',
        attributes: {},
        styles: {},
        parentStyles: {},
        rationale: 'Invalid target',
      }),
    ).toThrow('exactly one element');
  });

  it.each(unsafeChanges)('rejects event handlers and script-like mutation input', unsafeChange => {
    const manager = new PreviewPatchManager(document);

    expect(() =>
      manager.apply('[data-doable-id="save"]', {
        patchId: 'patch-1',
        selectionId: 'selection-1',
        attributes: {},
        styles: {},
        parentStyles: {},
        rationale: 'Unsafe draft',
        ...unsafeChange,
      }),
    ).toThrow('Unsafe preview patch');
  });
});
