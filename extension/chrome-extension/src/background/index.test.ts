import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({}));

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

describe('background selection routing', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('broadcasts a trusted completed selection and still returns it to the content script', async () => {
    let onMessage: Parameters<typeof chrome.runtime.onMessage.addListener>[0] | undefined;
    const broadcast = vi.fn(async () => undefined);
    const captureVisibleTab = vi.fn(async () => 'data:image/png;base64,captured');
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener: vi.fn(listener => (onMessage = listener)) },
        onConnect: { addListener: vi.fn() },
        sendMessage: broadcast,
      },
      tabs: {
        captureVisibleTab,
        query: vi.fn(async () => [{ id: 42 }]),
        sendMessage: vi.fn(),
      },
    });
    await import('./index');
    const sendResponse = vi.fn();

    const keepsChannelOpen = onMessage?.(
      { type: 'DOABLE_SELECTED_COMPONENT_PENDING', component: pendingSelection },
      { tab: { id: 42, windowId: 7 } } as chrome.runtime.MessageSender,
      sendResponse,
    );
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());

    const completed = {
      type: 'DOABLE_SELECTED_COMPONENT',
      component: {
        ...pendingSelection,
        tabId: 42,
        screenshotDataUrl: 'data:image/png;base64,captured',
      },
    };
    expect(keepsChannelOpen).toBe(true);
    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith(completed);
    expect(sendResponse).toHaveBeenCalledWith(completed);
  });

  it('does not capture or broadcast when the sender tab is inactive', async () => {
    let onMessage: Parameters<typeof chrome.runtime.onMessage.addListener>[0] | undefined;
    const broadcast = vi.fn(async () => undefined);
    const captureVisibleTab = vi.fn(async () => 'data:image/png;base64,captured');
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener: vi.fn(listener => (onMessage = listener)) },
        onConnect: { addListener: vi.fn() },
        sendMessage: broadcast,
      },
      tabs: {
        captureVisibleTab,
        query: vi.fn(async () => []),
        sendMessage: vi.fn(),
      },
    });
    await import('./index');
    const sendResponse = vi.fn();

    onMessage?.(
      { type: 'DOABLE_SELECTED_COMPONENT_PENDING', component: pendingSelection },
      { tab: { id: 42, windowId: 7 } } as chrome.runtime.MessageSender,
      sendResponse,
    );
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());

    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: 'Selection completion failed: Return to the selected tab and try again.',
    });
  });
});
