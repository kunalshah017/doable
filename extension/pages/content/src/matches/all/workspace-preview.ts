import type { WorkspacePreviewPayload } from '@extension/shared';

const PREVIEW_ATTRIBUTE = 'data-doable-workspace-preview';

export class WorkspacePreviewManager {
  private layer: HTMLDivElement | null = null;

  constructor(private readonly root: Document) {}

  apply(preview: WorkspacePreviewPayload) {
    this.clear();

    const layer = this.root.createElement('div');
    layer.setAttribute(PREVIEW_ATTRIBUTE, preview.patchId);
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483646',
      background: '#11161a',
      color: '#f4f1ea',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    });

    const summary = this.root.createElement('div');
    summary.textContent = preview.summary.join(' · ');
    Object.assign(summary.style, {
      position: 'absolute',
      inset: '0 0 auto 0',
      minHeight: '48px',
      display: 'flex',
      alignItems: 'center',
      padding: '0 132px 0 16px',
      background: '#11161a',
      borderBottom: '1px solid rgb(255 255 255 / 16%)',
      fontSize: '13px',
      lineHeight: '1.4',
    });

    const close = this.root.createElement('button');
    close.type = 'button';
    close.textContent = 'Close preview';
    close.addEventListener('click', () => this.clear());
    Object.assign(close.style, {
      position: 'absolute',
      top: '8px',
      right: '12px',
      zIndex: '2',
      height: '32px',
      border: '0',
      borderRadius: '4px',
      padding: '0 12px',
      background: '#f4f1ea',
      color: '#11161a',
      cursor: 'pointer',
      font: '600 12px ui-sans-serif, system-ui, sans-serif',
    });

    const iframe = this.root.createElement('iframe');
    iframe.title = 'Doable full-page preview';
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    iframe.srcdoc = preview.documentHtml;
    Object.assign(iframe.style, {
      position: 'absolute',
      inset: '48px 0 0 0',
      width: '100%',
      height: 'calc(100% - 48px)',
      border: '0',
      background: 'white',
    });

    layer.append(summary, close, iframe);
    (this.root.body ?? this.root.documentElement).append(layer);
    this.layer = layer;
  }

  clear() {
    this.layer?.remove();
    this.layer = null;
  }
}
