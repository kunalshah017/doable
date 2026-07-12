import { PreviewPatchManager } from './preview-patches';
import { WorkspacePreviewManager } from './workspace-preview';
import type {
  ContentMessage,
  ExtensionActionResponse,
  ExtensionMessage,
  PendingSelectedComponent,
  PendingSelectedComponentMessage,
  SelectionCompletionResponse,
  SelectionErrorMessage,
} from '@extension/shared';

const SHADOW_BOUNDARY = ' >>> ';
const COMPUTED_STYLE_PROPERTIES = [
  'display',
  'position',
  'width',
  'height',
  'margin',
  'padding',
  'gap',
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
  'border-radius',
] as const;

const previewPatches = new PreviewPatchManager(document);
const workspacePreview = new WorkspacePreviewManager(document);
let selectionModeActive = false;
let selectionCapturePending = false;
let hoverOverlay: HTMLDivElement | null = null;
let backgroundPort: chrome.runtime.Port | null = null;

const connectBackground = () => {
  if (backgroundPort) return;

  const port = chrome.runtime.connect({ name: 'doable-content' });
  backgroundPort = port;
  port.onDisconnect.addListener(() => {
    if (backgroundPort === port) backgroundPort = null;
  });
};

const selectorWithinRoot = (element: HTMLElement, root: Document | ShadowRoot) => {
  const doableId = element.dataset.doableId;
  if (doableId) {
    const selector = `[data-doable-id="${CSS.escape(doableId)}"]`;
    if (root.querySelectorAll(selector).length === 1) return selector;
  }
  if (element.id) {
    const selector = `#${CSS.escape(element.id)}`;
    if (root.querySelectorAll(selector).length === 1) return selector;
  }

  const segments: string[] = [];
  let current: HTMLElement | null = element;
  while (current) {
    let segment = current.localName;
    const currentLocalName = current.localName;
    const parentElement: HTMLElement | null = current.parentElement;
    const siblings = parentElement
      ? Array.from(parentElement.children).filter(sibling => sibling.localName === currentLocalName)
      : [];
    if (siblings.length > 1) {
      segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    segments.unshift(segment);

    if (!parentElement || parentElement.getRootNode() !== root) break;
    current = parentElement;
  }

  return segments.join(' > ');
};

const selectorForElement = (element: HTMLElement): string => {
  const root = element.getRootNode();
  const localSelector = selectorWithinRoot(element, root as Document | ShadowRoot);
  if (root instanceof ShadowRoot) {
    return `${selectorForElement(root.host as HTMLElement)}${SHADOW_BOUNDARY}${localSelector}`;
  }
  return localSelector;
};

const elementFromPointer = (event: PointerEvent | MouseEvent) => {
  const pathElement = event.composedPath().find(node => node instanceof HTMLElement && node !== hoverOverlay) as
    HTMLElement | undefined;
  if (pathElement) return pathElement;

  const pointElement = document.elementFromPoint(event.clientX, event.clientY);
  return pointElement instanceof HTMLElement && pointElement !== hoverOverlay ? pointElement : null;
};

const updateHoverOverlay = (element: HTMLElement | null) => {
  if (!hoverOverlay || !element) {
    if (hoverOverlay) hoverOverlay.hidden = true;
    return;
  }

  const rect = element.getBoundingClientRect();
  Object.assign(hoverOverlay.style, {
    display: 'block',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  hoverOverlay.hidden = false;
};

const createHoverOverlay = () => {
  if (hoverOverlay) return;

  hoverOverlay = document.createElement('div');
  hoverOverlay.dataset.doableOverlay = 'true';
  Object.assign(hoverOverlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    boxSizing: 'border-box',
    border: '2px solid #0ea5e9',
    background: 'rgb(14 165 233 / 10%)',
  });
  document.documentElement.append(hoverOverlay);
};

const captureSelectedComponent = (element: HTMLElement): PendingSelectedComponent => {
  const computedStyle = getComputedStyle(element);
  const computedStyles = Object.fromEntries(
    COMPUTED_STYLE_PROPERTIES.map(property => [property, computedStyle.getPropertyValue(property)]),
  );

  return {
    selectionId: crypto.randomUUID(),
    pageUrl: location.href,
    doableId: element.dataset.doableId,
    selector: selectorForElement(element),
    outerHtml: element.outerHTML,
    parentHtml: element.parentElement?.outerHTML ?? '',
    computedStyles,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
};

const emitSelection = async (element: HTMLElement) => {
  connectBackground();
  const component = captureSelectedComponent(element);
  const message = {
    type: 'DOABLE_SELECTED_COMPONENT_PENDING',
    component,
  } satisfies PendingSelectedComponentMessage;
  const response: SelectionCompletionResponse = await chrome.runtime.sendMessage(message);
  if ('ok' in response && !response.ok) {
    throw new Error(response.error ?? 'Selection completion failed. Reload the page and try again.');
  }
};

const emitSelectionError = async (error: unknown) => {
  const message = {
    type: 'DOABLE_SELECTION_ERROR',
    error: error instanceof Error ? error.message : String(error),
  } satisfies SelectionErrorMessage;
  await chrome.runtime.sendMessage(message);
};

const onPointerMove = (event: PointerEvent) => {
  if (selectionModeActive) updateHoverOverlay(elementFromPointer(event));
};

const removeSelectionListeners = () => {
  window.removeEventListener('pointermove', onPointerMove, true);
  window.removeEventListener('click', onSelectionClick, true);
};

const disableSelectionMode = () => {
  selectionModeActive = false;
  selectionCapturePending = false;
  removeSelectionListeners();
  hoverOverlay?.remove();
  hoverOverlay = null;
};

const onSelectionClick = (event: MouseEvent) => {
  if (!selectionModeActive) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (selectionCapturePending) return;

  selectionCapturePending = true;
  const element = elementFromPointer(event);
  if (!element) {
    selectionCapturePending = false;
    void emitSelectionError(
      'Selection failed: No page element was found. Move the pointer over an element and try again.',
    );
    return;
  }
  void emitSelection(element)
    .then(disableSelectionMode)
    .catch(error => {
      selectionCapturePending = false;
      void emitSelectionError(error).catch(deliveryError =>
        console.error('[Doable] Error delivery failed', deliveryError),
      );
    });
};

const enableSelectionMode = () => {
  if (selectionModeActive) return;

  selectionModeActive = true;
  createHoverOverlay();
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('click', onSelectionClick, true);
};

const handleContentMessage = (message: ContentMessage) => {
  switch (message.type) {
    case 'DOABLE_SET_SELECTION_MODE':
      if (message.enabled) enableSelectionMode();
      else disableSelectionMode();
      break;
    case 'DOABLE_APPLY_PREVIEW':
      previewPatches.apply(message.selector, message.patch);
      break;
    case 'DOABLE_UNDO_PREVIEW':
      previewPatches.undo(message.patchId);
      break;
    case 'DOABLE_CLEAR_PREVIEWS':
      previewPatches.clear();
      workspacePreview.clear();
      break;
    case 'DOABLE_APPLY_WORKSPACE_PREVIEW':
      workspacePreview.apply(message.preview);
      break;
    case 'DOABLE_CLEAR_WORKSPACE_PREVIEW':
      workspacePreview.clear();
      break;
  }
};

window.addEventListener('pagehide', () => workspacePreview.clear());

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  try {
    if (
      message.type === 'DOABLE_SET_SELECTION_MODE' ||
      message.type === 'DOABLE_APPLY_PREVIEW' ||
      message.type === 'DOABLE_UNDO_PREVIEW' ||
      message.type === 'DOABLE_CLEAR_PREVIEWS'
    ) {
      handleContentMessage(message);
      sendResponse({ ok: true } satisfies ExtensionActionResponse);
    }
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ExtensionActionResponse);
  }
  return false;
});

const disposeContentState = () => {
  disableSelectionMode();
  previewPatches.clear();
};
connectBackground();
window.addEventListener('pagehide', disposeContentState, { once: true });

console.info('[Doable] Content script ready');
