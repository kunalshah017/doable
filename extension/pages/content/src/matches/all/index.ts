import { PreviewPatchManager } from './preview-patches';
import type {
  ContentMessage,
  ExtensionActionResponse,
  ExtensionMessage,
  PendingSelectedComponent,
  PendingSelectedComponentMessage,
  SelectionCompletionResponse,
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
let selectionModeActive = false;
let hoverOverlay: HTMLDivElement | null = null;

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

const onPointerMove = (event: PointerEvent) => {
  if (selectionModeActive) updateHoverOverlay(elementFromPointer(event));
};

const removeSelectionListeners = () => {
  window.removeEventListener('pointermove', onPointerMove, true);
  window.removeEventListener('click', onSelectionClick, true);
};

const disableSelectionMode = () => {
  selectionModeActive = false;
  removeSelectionListeners();
  hoverOverlay?.remove();
  hoverOverlay = null;
  previewPatches.clear();
};

const onSelectionClick = (event: MouseEvent) => {
  if (!selectionModeActive) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const element = elementFromPointer(event);
  disableSelectionMode();
  if (element) void emitSelection(element).catch(error => console.error('[Doable] Selection failed', error));
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
      break;
  }
};

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

const backgroundPort = chrome.runtime.connect({ name: 'doable-content' });
backgroundPort.onDisconnect.addListener(disableSelectionMode);
window.addEventListener('pagehide', disableSelectionMode, { once: true });

console.info('[Doable] Content script ready');
