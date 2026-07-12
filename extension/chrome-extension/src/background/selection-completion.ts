import type {
  PendingSelectedComponent,
  SelectionCompletionResponse,
  SelectedComponentMessage,
} from '@extension/shared';

type SelectionSender = {
  tab?: {
    id?: number;
    windowId?: number;
  };
};

type CaptureVisibleTab = (windowId: number | undefined, options: { format: 'png' }) => Promise<string>;

export const completeSelection = async (
  selection: PendingSelectedComponent,
  sender: SelectionSender,
  captureVisibleTab: CaptureVisibleTab,
): Promise<SelectionCompletionResponse> => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    return {
      ok: false,
      error: 'Selection completion failed: The selection sender has no tab ID. Reload the page and try again.',
    };
  }

  try {
    const screenshotDataUrl = await captureVisibleTab(sender.tab?.windowId, { format: 'png' });
    return {
      type: 'DOABLE_SELECTED_COMPONENT',
      component: {
        ...selection,
        tabId,
        screenshotDataUrl,
      },
    } satisfies SelectedComponentMessage;
  } catch (error) {
    return {
      ok: false,
      error: `Selection completion failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};