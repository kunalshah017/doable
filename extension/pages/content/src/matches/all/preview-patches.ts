import type { PreviewPatch } from '@extension/shared';

type PatchSnapshot = {
  patchId: string;
  patch: PreviewPatch;
  target: HTMLElement;
  parent: HTMLElement | null;
  childNodes?: Node[];
  attributes: Array<[string, string | null]>;
  styles: StylePropertySnapshot[];
  parentStyles: StylePropertySnapshot[];
  targetHadStyleAttribute: boolean;
  parentHadStyleAttribute: boolean;
};

type StylePropertySnapshot = {
  name: string;
  value: string | null;
  priority: string;
};

const ALLOWED_ATTRIBUTE = /^(?:class|title|role|alt|placeholder|value|aria-[\w-]+|data-[\w-]+)$/i;
const UNSAFE_VALUE = /(?:<\s*script\b|javascript\s*:|expression\s*\(|@import\b|-moz-binding\b)/i;

const assertSafePatch = (patch: PreviewPatch) => {
  const unsafeAttribute = Object.entries(patch.attributes ?? {}).some(
    ([name, value]) =>
      name.toLowerCase().startsWith('on') || !ALLOWED_ATTRIBUTE.test(name) || UNSAFE_VALUE.test(value ?? ''),
  );
  const unsafeStyle = [...Object.entries(patch.styles ?? {}), ...Object.entries(patch.parentStyles ?? {})].some(
    ([name, value]) => name.toLowerCase().startsWith('on') || UNSAFE_VALUE.test(value ?? ''),
  );

  if (unsafeAttribute || unsafeStyle || UNSAFE_VALUE.test(patch.text ?? '')) {
    throw new Error('Unsafe preview patch');
  }
};

const restoreAttribute = (element: HTMLElement, name: string, value: string | null) => {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
};

const snapshotStyleProperties = (element: HTMLElement, names: string[]): StylePropertySnapshot[] =>
  names.map(name => {
    const value = element.style.getPropertyValue(name);
    const priority = element.style.getPropertyPriority(name);
    const propertyNames = Array.from({ length: element.style.length }, (_, index) => element.style.item(index));
    return { name, value: propertyNames.includes(name) ? value : null, priority };
  });

const restoreStyleProperties = (
  element: HTMLElement,
  properties: StylePropertySnapshot[],
  hadStyleAttribute: boolean,
) => {
  if (properties.length === 0) return;

  for (const { name, value, priority } of properties) {
    if (value === null) element.style.removeProperty(name);
    else element.style.setProperty(name, value, priority);
  }
  if (!hadStyleAttribute && element.getAttribute('style') === '') {
    element.removeAttribute('style');
  }
};

const resolveElements = (root: Document, selector: string): HTMLElement[] => {
  const segments = selector.split(/\s*>>>\s*/);
  let currentRoot: Document | ShadowRoot = root;

  for (const [index, segment] of segments.entries()) {
    const matches: HTMLElement[] = Array.from(currentRoot.querySelectorAll<HTMLElement>(segment));
    if (index === segments.length - 1 || matches.length !== 1) {
      return matches;
    }
    if (!matches[0].shadowRoot) {
      return [];
    }
    currentRoot = matches[0].shadowRoot;
  }

  return [];
};

export class PreviewPatchManager {
  private readonly snapshots: PatchSnapshot[] = [];

  constructor(private readonly root: Document) {}

  apply(selector: string, patch: PreviewPatch) {
    assertSafePatch(patch);

    const matches = resolveElements(this.root, selector);
    if (matches.length !== 1) {
      throw new Error(`Preview selector must resolve to exactly one element; found ${matches.length}`);
    }
    if (this.snapshots.some(snapshot => snapshot.patchId === patch.patchId)) {
      throw new Error(`Preview patch already exists: ${patch.patchId}`);
    }

    this.applyToTarget(matches[0], patch);
  }

  undo(patchId: string) {
    const index = this.snapshots.findIndex(snapshot => snapshot.patchId === patchId);
    if (index === -1) {
      throw new Error(`Preview patch not found: ${patchId}`);
    }

    const remaining = this.snapshots.filter(snapshot => snapshot.patchId !== patchId);
    this.clear();
    for (const snapshot of remaining) {
      this.applyToTarget(snapshot.target, snapshot.patch);
    }
  }

  clear() {
    while (this.snapshots.length > 0) {
      this.restore(this.snapshots.pop()!);
    }
  }

  private applyToTarget(target: HTMLElement, patch: PreviewPatch) {
    const parent = target.parentElement;
    if (Object.keys(patch.parentStyles ?? {}).length > 0 && !parent) {
      throw new Error('Preview patch requires a direct parent');
    }

    this.snapshots.push({
      patchId: patch.patchId,
      patch,
      target,
      parent,
      childNodes: patch.text === undefined ? undefined : Array.from(target.childNodes),
      attributes: Object.keys(patch.attributes ?? {}).map(name => [name, target.getAttribute(name)]),
      styles: snapshotStyleProperties(target, Object.keys(patch.styles ?? {})),
      parentStyles: parent ? snapshotStyleProperties(parent, Object.keys(patch.parentStyles ?? {})) : [],
      targetHadStyleAttribute: target.hasAttribute('style'),
      parentHadStyleAttribute: parent?.hasAttribute('style') ?? false,
    });

    if (patch.text !== undefined) {
      target.textContent = patch.text;
    }
    for (const [name, value] of Object.entries(patch.attributes ?? {})) {
      restoreAttribute(target, name, value);
    }
    for (const [name, value] of Object.entries(patch.styles ?? {})) {
      if (value === null) target.style.removeProperty(name);
      else target.style.setProperty(name, value);
    }
    for (const [name, value] of Object.entries(patch.parentStyles ?? {})) {
      if (value === null) parent?.style.removeProperty(name);
      else parent?.style.setProperty(name, value);
    }
  }

  private restore(snapshot: PatchSnapshot) {
    if (snapshot.childNodes) {
      snapshot.target.replaceChildren(...snapshot.childNodes);
    }
    for (const [name, value] of snapshot.attributes) {
      restoreAttribute(snapshot.target, name, value);
    }
    restoreStyleProperties(snapshot.target, snapshot.styles, snapshot.targetHadStyleAttribute);
    if (snapshot.parent) {
      restoreStyleProperties(snapshot.parent, snapshot.parentStyles, snapshot.parentHadStyleAttribute);
    }
  }
}
