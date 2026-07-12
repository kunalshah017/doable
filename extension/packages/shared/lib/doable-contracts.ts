export type SelectedComponent = {
  selectionId: string;
  tabId: number;
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

export type PendingSelectedComponent = Omit<SelectedComponent, 'tabId' | 'screenshotDataUrl'>;

export type PreviewPatch = {
  patchId: string;
  selectionId: string;
  text?: string;
  attributes?: Record<string, string | null>;
  styles?: Record<string, string | null>;
  parentStyles?: Record<string, string | null>;
  rationale: string;
};

export type ApprovedChange = {
  changeId: string;
  selection: SelectedComponent;
  request: string;
  previewPatch: PreviewPatch;
  beforeScreenshot: string;
  afterScreenshot: string;
  qa: {
    passed: boolean;
    checks: string[];
  };
  approvedAt: string;
};

export type SelectionModeMessage = {
  type: 'DOABLE_SET_SELECTION_MODE';
  enabled: boolean;
};

export type SelectedComponentMessage = {
  type: 'DOABLE_SELECTED_COMPONENT';
  component: SelectedComponent;
};

export type PendingSelectedComponentMessage = {
  type: 'DOABLE_SELECTED_COMPONENT_PENDING';
  component: PendingSelectedComponent;
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

export type ExtensionActionResponse = {
  ok: boolean;
  error?: string;
};

export type SelectionCompletionResponse = SelectedComponentMessage | ExtensionActionResponse;

export type ContentMessage = SelectionModeMessage | ApplyPreviewMessage | UndoPreviewMessage | ClearPreviewsMessage;

export type ExtensionMessage =
  | ContentMessage
  | PendingSelectedComponentMessage
  | SelectedComponentMessage;
