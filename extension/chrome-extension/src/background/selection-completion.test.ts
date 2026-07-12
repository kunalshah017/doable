import { completeSelection } from './selection-completion';
import { describe, expect, it, vi } from 'vitest';

const pendingSelection = {
  selectionId: 'selection-1',
  pageUrl: 'https://example.com/',
  doableId: 'save',
  selector: '[data-doable-id="save"]',
  outerHtml: '<button data-doable-id="save">Save</button>',
  parentHtml: '<main><button data-doable-id="save">Save</button></main>',
  computedStyles: { display: 'inline-block' },
  viewport: { width: 1280, height: 720 },
};

describe('completeSelection', () => {
  it('derives tab ID and screenshot from the background context', async () => {
    const captureVisibleTab = vi.fn(async () => 'data:image/png;base64,captured');
    const queryActiveTabs = vi.fn(async () => [{ id: 42, url: pendingSelection.pageUrl }]);
    const callerPayload = Object.assign({}, pendingSelection, {
      tabId: 999,
      screenshotDataUrl: 'data:image/png;base64,caller-supplied',
    });

    const result = await completeSelection(
      callerPayload,
      { tab: { id: 42, windowId: 7 } },
      captureVisibleTab,
      queryActiveTabs,
    );

    expect(queryActiveTabs).toHaveBeenCalledWith({ active: true, windowId: 7 });
    expect(queryActiveTabs).toHaveBeenCalledTimes(2);
    expect(captureVisibleTab).toHaveBeenCalledWith(7, { format: 'png' });
    expect(result).toEqual({
      type: 'DOABLE_SELECTED_COMPONENT',
      component: {
        ...pendingSelection,
        tabId: 42,
        screenshotDataUrl: 'data:image/png;base64,captured',
      },
    });
  });

  it('returns an actionable error when the sender tab ID is absent', async () => {
    const captureVisibleTab = vi.fn(async () => 'data:image/png;base64,captured');
    const queryActiveTabs = vi.fn(async () => [{ id: 42 }]);

    const result = await completeSelection(
      pendingSelection,
      { tab: { windowId: 7 } },
      captureVisibleTab,
      queryActiveTabs,
    );

    expect(queryActiveTabs).not.toHaveBeenCalled();
    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: 'Selection completion failed: The selection sender has no tab ID. Reload the page and try again.',
    });
  });

  it.each([
    ['no active tab', []],
    ['another active tab', [{ id: 99 }]],
  ])('rejects capture when the sender is inactive: %s', async (_case, activeTabs) => {
    const captureVisibleTab = vi.fn(async () => 'data:image/png;base64,captured');
    const queryActiveTabs = vi.fn(async () => activeTabs);

    const result = await completeSelection(
      pendingSelection,
      { tab: { id: 42, windowId: 7 } },
      captureVisibleTab,
      queryActiveTabs,
    );

    expect(queryActiveTabs).toHaveBeenCalledWith({ active: true, windowId: 7 });
    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: 'Selection completion failed: Return to the selected tab and try again.',
    });
  });
});
