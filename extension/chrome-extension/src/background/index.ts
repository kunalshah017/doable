import type { ContentMessage, ExtensionActionResponse, ExtensionMessage } from '@extension/shared';
import { completeSelection } from './selection-completion';
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

function assertSupportedTab(tab: chrome.tabs.Tab | undefined): asserts tab is chrome.tabs.Tab & { id: number } {
  if (tab?.id === undefined) {
    throw new Error('No active tab is available. Open an http(s) page and try again.');
  }
  if (!tab.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error('Doable cannot run on this protected page. Open an http(s) page and try again.');
  }
}

const routeToActiveTab = async (message: ContentMessage): Promise<ExtensionActionResponse> => {
  const tab = await getActiveTab();
  assertSupportedTab(tab);
  try {
    return await chrome.tabs.sendMessage<ContentMessage, ExtensionActionResponse>(tab.id, message);
  } catch (error) {
    throw new Error(
      `Doable could not reach the active page. Reload the page and try again. ${error instanceof Error ? error.message : String(error)}`,
    );
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

  if (message.type === 'DOABLE_SELECTED_COMPONENT_PENDING') {
    void completeSelection(message.component, sender, chrome.tabs.captureVisibleTab).then(async response => {
      if ('type' in response && response.type === 'DOABLE_SELECTED_COMPONENT') {
        try {
          await chrome.runtime.sendMessage(response);
        } catch (error) {
          console.error('[Doable] Selection delivery failed', error);
        }
      }
      sendResponse(response);
    });
    return true;
  }
  return false;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'doable-content') port.onDisconnect.addListener(() => undefined);
});

console.info('[Doable] Background ready');
