export type SelectedComponent = {
  selectionId: string;
  pageUrl: string;
  doableId?: string;
  selector: string;
  outerHtml: string;
  parentHtml: string;
  computedStyles: Record<string, string>;
  viewport: {
    width: number;
    height: number;
  };
  screenshotDataUrl: string;
};

export type PreviewPatch = {
  patchId: string;
  selectionId: string;
  text?: string;
  attributes: Record<string, string | null>;
  styles: Record<string, string | null>;
  parentStyles: Record<string, string | null>;
  rationale: string;
};

export type SelectionModeMessage = {
  type: 'DOABLE_SET_SELECTION_MODE';
  enabled: boolean;
};

export type SelectedComponentMessage = {
  type: 'DOABLE_SELECTED_COMPONENT';
  component: SelectedComponent;
};

export type ApplyPreviewMessage = {
  type: 'DOABLE_APPLY_PREVIEW';
  selector: string;
  patch: PreviewPatch;
};

export type UndoPreviewMessage = {
  type: 'DOABLE_UNDO_PREVIEW';
  patchId: string;
};

export type ClearPreviewsMessage = {
  type: 'DOABLE_CLEAR_PREVIEWS';
};

export type CaptureScreenshotMessage = {
  type: 'DOABLE_CAPTURE_SCREENSHOT';
  selectionId: string;
};

export type CaptureScreenshotResponse = {
  type: 'DOABLE_SCREENSHOT_CAPTURED';
  selectionId: string;
  screenshotDataUrl: string;
  error?: string;
};

export type ExtensionActionResponse = {
  ok: boolean;
  error?: string;
};

export type ContentMessage = SelectionModeMessage | ApplyPreviewMessage | UndoPreviewMessage | ClearPreviewsMessage;

export type ExtensionMessage =
  ContentMessage | SelectedComponentMessage | CaptureScreenshotMessage | CaptureScreenshotResponse;
