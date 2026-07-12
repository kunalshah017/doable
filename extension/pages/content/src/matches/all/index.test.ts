import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentMessage, ExtensionActionResponse } from '@extension/shared';

type ContentListener = (
  message: ContentMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ExtensionActionResponse) => void,
) => boolean | undefined;

const flushMessages = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('content selection controller', () => {
  let contentListener: ContentListener | undefined;
  let disconnectListener: (() => void) | undefined;
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<main><button data-doable-id="save"><span>Save</span></button></main>';
    vi.stubGlobal('CSS', { escape: (value: string) => value });
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => 'selection-1',
    });
    sendMessage = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        onMessage: { addListener: vi.fn(listener => (contentListener = listener)) },
        connect: vi.fn(() => ({
          onDisconnect: { addListener: vi.fn(listener => (disconnectListener = listener)) },
        })),
      },
    });
    await import('./index');
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.unstubAllGlobals();
  });

  it('keeps selection active and emits an actionable typed error when capture fails', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: false,
      error: 'Selection completion failed: Capture is unavailable. Keep selection active and try again.',
    });
    sendMessage.mockResolvedValue(undefined);
    contentListener?.({ type: 'DOABLE_SET_SELECTION_MODE', enabled: true }, {}, vi.fn());

    document.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await flushMessages();

    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'DOABLE_SELECTION_ERROR',
      error: 'Selection completion failed: Capture is unavailable. Keep selection active and try again.',
    });

    document.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await flushMessages();
    expect(
      sendMessage.mock.calls.filter(([message]) => message.type === 'DOABLE_SELECTED_COMPONENT_PENDING'),
    ).toHaveLength(2);
  });

  it('preserves previews when selection toggles off, but clears them explicitly or on disconnect', () => {
    const target = document.querySelector<HTMLElement>('[data-doable-id="save"]')!;
    const apply = (patchId: string, text: string) =>
      contentListener?.(
        {
          type: 'DOABLE_APPLY_PREVIEW',
          selector: '[data-doable-id="save"]',
          patch: { patchId, selectionId: 'selection-1', text, rationale: 'Preview copy' },
        },
        {},
        vi.fn(),
      );

    apply('patch-1', 'Preview');
    contentListener?.({ type: 'DOABLE_SET_SELECTION_MODE', enabled: false }, {}, vi.fn());
    expect(target.textContent).toBe('Preview');

    contentListener?.({ type: 'DOABLE_CLEAR_PREVIEWS' }, {}, vi.fn());
    expect(target.textContent).toBe('Save');

    apply('patch-2', 'Another preview');
    disconnectListener?.();
    expect(target.textContent).toBe('Save');
  });
});
