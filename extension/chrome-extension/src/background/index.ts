import type {
  CaptureScreenshotResponse,
  ContentMessage,
  ExtensionActionResponse,
  ExtensionMessage,
} from '@extension/shared';
import 'webextension-polyfill';

const isContentMessage = (message: ExtensionMessage): message is ContentMessage =>
  message.type === 'DOABLE_SET_SELECTION_MODE' ||
  message.type === 'DOABLE_APPLY_PREVIEW' ||
  message.type === 'DOABLE_UNDO_PREVIEW' ||
  message.type === 'DOABLE_CLEAR_PREVIEWS';

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

const assertSupportedTab = (tab: chrome.tabs.Tab | undefined) => {
  if (!tab?.id) {
    throw new Error('No active tab is available. Open an http(s) page and try again.');
  }
  if (!tab.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error('Doable cannot run on this protected page. Open an http(s) page and try again.');
  }
  return tab;
};

const routeToActiveTab = async (message: ContentMessage): Promise<ExtensionActionResponse> => {
  const tab = assertSupportedTab(await getActiveTab());
  try {
    return (await chrome.tabs.sendMessage(tab.id!, message)) as ExtensionActionResponse;
  } catch (error) {
    throw new Error(
      `Doable could not reach the active page. Reload the page and try again. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const captureScreenshot = async (
  selectionId: string,
  sender: chrome.runtime.MessageSender,
): Promise<CaptureScreenshotResponse> => {
  try {
    const tab = assertSupportedTab(sender.tab ?? (await getActiveTab()));
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    return { type: 'DOABLE_SCREENSHOT_CAPTURED', selectionId, screenshotDataUrl };
  } catch (error) {
    return {
      type: 'DOABLE_SCREENSHOT_CAPTURED',
      selectionId,
      screenshotDataUrl: '',
      error: `Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (isContentMessage(message)) {
    void routeToActiveTab(message)
      .then(sendResponse)
      .catch(error =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies ExtensionActionResponse),
      );
    return true;
  }

  if (message.type === 'DOABLE_CAPTURE_SCREENSHOT') {
    void captureScreenshot(message.selectionId, sender).then(sendResponse);
    return true;
  }

  if (message.type === 'DOABLE_SELECTED_COMPONENT') {
    sendResponse({ ok: true } satisfies ExtensionActionResponse);
  }
  return false;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'doable-content') port.onDisconnect.addListener(() => undefined);
});

console.info('[Doable] Background ready');
