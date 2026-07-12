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
type QueryActiveTabs = (queryInfo: { active: true; windowId: number }) => Promise<Array<{ id?: number; url?: string }>>;

export const completeSelection = async (
  selection: PendingSelectedComponent,
  sender: SelectionSender,
  captureVisibleTab: CaptureVisibleTab,
  queryActiveTabs: QueryActiveTabs,
): Promise<SelectionCompletionResponse> => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    return {
      ok: false,
      error: 'Selection completion failed: The selection sender has no tab ID. Reload the page and try again.',
    };
  }
  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    return {
      ok: false,
      error: 'Selection completion failed: The selection sender has no window ID. Reload the page and try again.',
    };
  }

  try {
    const [activeTab] = await queryActiveTabs({ active: true, windowId });
    if (activeTab?.id !== tabId) {
      return {
        ok: false,
        error: 'Selection completion failed: Return to the selected tab and try again.',
      };
    }

    const screenshotDataUrl = await captureVisibleTab(windowId, { format: 'png' });
    const [activeTabAfterCapture] = await queryActiveTabs({ active: true, windowId });
    if (activeTabAfterCapture?.id !== tabId || activeTabAfterCapture.url !== selection.pageUrl) {
      return {
        ok: false,
        error:
          'Selection completion failed: The active tab or page changed during capture. Select the component again and try again.',
      };
    }

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
