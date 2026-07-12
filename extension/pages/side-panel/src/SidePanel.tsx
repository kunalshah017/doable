import '@src/SidePanel.css';
import { DoableServerApi, SERVER_BASE_URL, displayError } from '@src/server-api';
import { useEffect, useState } from 'react';
import type {
  ApprovedChange,
  ContentMessage,
  ExtensionActionResponse,
  ExtensionMessage,
  PreviewPatch,
  SelectedComponent,
} from '@extension/shared';

const serverApi = new DoableServerApi();

type BusyAction = 'selecting' | 'previewing' | 'undoing' | 'discarding' | 'approving' | null;
type ServiceState = 'checking' | 'online' | 'offline';
type Notice = { kind: 'error' | 'success'; text: string } | null;

const sendToTab = async (tabId: number, message: ContentMessage) => {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as ExtensionActionResponse;
    if (!response?.ok) throw new Error(response?.error || 'The page rejected the action.');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Doable could not reach the page. Reload it and try again. ${detail}`);
  }
};

const getActiveWebTab = async (): Promise<chrome.tabs.Tab & { id: number }> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab is available. Open a website and try again.');
  if (!tab.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error('This is a protected page. Open an http(s) website and try again.');
  }
  return tab as chrome.tabs.Tab & { id: number };
};

const componentSummary = (component: SelectedComponent) => {
  const parsed = new DOMParser().parseFromString(component.outerHtml, 'text/html');
  const element = parsed.body.firstElementChild;
  const label = element?.textContent?.replace(/\s+/g, ' ').trim() || component.doableId || component.selector;
  return {
    tag: element?.tagName.toLowerCase() || 'element',
    label: label.slice(0, 96),
  };
};

const SidePanel = () => {
  const [serverState, setServerState] = useState<ServiceState>('checking');
  const [hermesState, setHermesState] = useState<ServiceState>('checking');
  const [hermesDetail, setHermesDetail] = useState('');
  const [selection, setSelection] = useState<SelectedComponent | null>(null);
  const [request, setRequest] = useState('');
  const [draft, setDraft] = useState<{ request: string; patch: PreviewPatch } | null>(null);
  const [changes, setChanges] = useState<ApprovedChange[]>([]);
  const [approvedSelectionId, setApprovedSelectionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setServerState('checking');
      setHermesState('checking');
      try {
        await serverApi.health();
        if (!active) return;
        setServerState('online');

        const session = await serverApi.getSession();
        const [approvedChanges, hermes] = await Promise.all([serverApi.getChanges(), serverApi.hermesStatus()]);
        if (!active) return;
        setSelection(session.selection);
        setDraft(session.draft ? { request: session.draft.request, patch: session.draft.patch } : null);
        setRequest(session.draft?.request || '');
        setChanges(approvedChanges);
        setApprovedSelectionId(
          session.selection &&
            approvedChanges.some(change => change.selection.selectionId === session.selection?.selectionId)
            ? session.selection.selectionId
            : null,
        );
        setHermesState(hermes.status === 'available' ? 'online' : 'offline');
        setHermesDetail(hermes.detail || '');
      } catch (error) {
        if (!active) return;
        setServerState('offline');
        setHermesState('offline');
        setNotice({ kind: 'error', text: displayError(error) });
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    const onMessage = (message: ExtensionMessage) => {
      if (message.type === 'DOABLE_SELECTION_ERROR') {
        setBusy(null);
        setNotice({ kind: 'error', text: message.error });
        return;
      }
      if (message.type !== 'DOABLE_SELECTED_COMPONENT') return;

      setBusy(null);
      setNotice(null);
      void serverApi
        .selectComponent(message.component)
        .then(() => {
          setSelection(message.component);
          setDraft(null);
          setRequest('');
          setApprovedSelectionId(null);
          setNotice({ kind: 'success', text: 'Component selected.' });
        })
        .catch(error => setNotice({ kind: 'error', text: displayError(error) }));
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const selectElement = async () => {
    setNotice(null);
    setBusy('selecting');
    try {
      const tab = await getActiveWebTab();
      await sendToTab(tab.id, { type: 'DOABLE_SET_SELECTION_MODE', enabled: true });
    } catch (error) {
      setBusy(null);
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not start selection.' });
    }
  };

  const previewChange = async () => {
    const trimmedRequest = request.trim();
    if (!selection || !trimmedRequest) return;

    setNotice(null);
    setBusy('previewing');
    let appliedPatch: PreviewPatch | null = null;
    try {
      const { patch } = await serverApi.preview(trimmedRequest);
      await sendToTab(selection.tabId, { type: 'DOABLE_APPLY_PREVIEW', selector: selection.selector, patch });
      appliedPatch = patch;
      await serverApi.confirmPreview(trimmedRequest, selection, patch);
      setDraft({ request: trimmedRequest, patch });
      setNotice({ kind: 'success', text: 'Preview applied to the page.' });
    } catch (error) {
      if (appliedPatch) {
        await sendToTab(selection.tabId, {
          type: 'DOABLE_UNDO_PREVIEW',
          patchId: appliedPatch.patchId,
        }).catch(() => undefined);
      }
      await serverApi.deleteDraft().catch(() => undefined);
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setBusy(null);
    }
  };

  const undoPreview = async () => {
    if (!selection || !draft) return;
    setNotice(null);
    setBusy('undoing');
    try {
      await serverApi.deleteDraft();
      await sendToTab(selection.tabId, { type: 'DOABLE_UNDO_PREVIEW', patchId: draft.patch.patchId });
      setDraft(null);
      setNotice({ kind: 'success', text: 'Preview undone.' });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setBusy(null);
    }
  };

  const discardDraft = async () => {
    if (!selection) return;
    setNotice(null);
    setBusy('discarding');
    try {
      await serverApi.deleteDraft();
      await sendToTab(selection.tabId, { type: 'DOABLE_CLEAR_PREVIEWS' });
      setDraft(null);
      setRequest('');
      setNotice({ kind: 'success', text: 'Draft cleared.' });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setBusy(null);
    }
  };

  const approveChange = async () => {
    if (!selection || !draft) return;
    setNotice(null);
    setBusy('approving');
    try {
      const approval = await serverApi.approve();
      setChanges(current => [...current, approval.change]);
      setDraft(null);
      setRequest('');
      setApprovedSelectionId(approval.change.selection.selectionId);
      setNotice({ kind: 'success', text: 'Change approved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setBusy(null);
    }
  };

  const selectedSummary = selection ? componentSummary(selection) : null;
  const stage = !selection ? 1 : busy === 'previewing' ? 3 : draft ? 4 : approvedSelectionId ? 5 : 2;
  const stages = ['Select', 'Describe', 'Preview', 'Approve'];

  return (
    <div className="doable-shell">
      <header className="topbar">
        <span className="wordmark">Doable</span>
        <button className="refresh-button" type="button" onClick={() => setRefreshKey(value => value + 1)}>
          Refresh status
        </button>
      </header>

      <div className="workspace">
        <nav className="run-rail" aria-label="Change stages">
          <ol>
            {stages.map((label, index) => {
              const number = index + 1;
              const state = number < stage ? 'complete' : number === stage ? 'active' : '';
              return (
                <li className={state} key={label} aria-current={state === 'active' ? 'step' : undefined}>
                  <span className="stage-number">{state === 'complete' ? 'OK' : number}</span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
        </nav>

        <main>
          <section className="status-section" aria-label="Connections">
            <div className="status-row">
              <span className={`status-dot ${serverState}`} aria-hidden="true" />
              <span>
                <strong>Server</strong>
                <small>
                  {serverState === 'online'
                    ? 'Online'
                    : serverState === 'checking'
                      ? 'Checking...'
                      : `Offline - start ${SERVER_BASE_URL}`}
                </small>
              </span>
            </div>
            <div className="status-row">
              <span className={`status-dot ${hermesState}`} aria-hidden="true" />
              <span>
                <strong>Hermes</strong>
                <small>
                  {hermesState === 'online'
                    ? 'Ready'
                    : hermesState === 'checking'
                      ? 'Checking...'
                      : hermesDetail || 'Unavailable - start the local Hermes API'}
                </small>
              </span>
            </div>
            <div className="status-row muted">
              <span className="status-dot disabled" aria-hidden="true" />
              <span>
                <strong>GitHub</strong>
                <small>Next: connect a repository</small>
              </span>
              <button type="button" disabled>
                Connect GitHub
              </button>
            </div>
          </section>

          {notice && (
            <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
              {notice.text}
            </div>
          )}

          <section className="flow-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">01 / Select</span>
                <h1>Choose a component</h1>
              </div>
              <button
                className={busy === 'selecting' ? 'secondary selecting' : 'secondary'}
                type="button"
                onClick={() => void selectElement()}
                disabled={busy !== null || draft !== null || serverState !== 'online'}>
                {busy === 'selecting' ? 'Selecting...' : selection ? 'Select another' : 'Select element'}
              </button>
            </div>

            {selection && selectedSummary ? (
              <div className="selection-summary">
                <img src={selection.screenshotDataUrl} alt="Selected component screenshot" />
                <div>
                  <span className="tag-label">{selectedSummary.tag}</span>
                  <strong>{selectedSummary.label}</strong>
                  <small title={selection.pageUrl}>{new URL(selection.pageUrl).hostname}</small>
                </div>
              </div>
            ) : (
              <p className="empty-copy">Open a website, then select the part you want to change.</p>
            )}
          </section>

          <section className="flow-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">02 / Describe</span>
                <h2>Request the change</h2>
              </div>
            </div>
            <label htmlFor="change-request">What should be different?</label>
            <textarea
              id="change-request"
              value={request}
              onChange={event => setRequest(event.target.value)}
              placeholder="Make this call to action clearer and more prominent."
              rows={4}
              maxLength={4000}
              disabled={!selection || draft !== null || busy !== null}
            />
            <button
              className="primary full-width"
              type="button"
              onClick={() => void previewChange()}
              disabled={!selection || !request.trim() || draft !== null || busy !== null || hermesState !== 'online'}>
              {busy === 'previewing' ? 'Creating preview...' : 'Preview change'}
            </button>
          </section>

          <section className="flow-section preview-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">03-04 / Preview and approve</span>
                <h2>Review on the page</h2>
              </div>
            </div>
            {draft ? (
              <>
                <div className="rationale">
                  <span>Hermes rationale</span>
                  <p>{draft.patch.rationale}</p>
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void undoPreview()}
                    disabled={busy !== null}>
                    Undo
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void discardDraft()}
                    disabled={busy !== null}>
                    Discard
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void approveChange()}
                    disabled={busy !== null}>
                    {busy === 'approving' ? 'Approving...' : 'Approve'}
                  </button>
                </div>
              </>
            ) : (
              <p className="empty-copy">Your reversible preview and approval controls will appear here.</p>
            )}
          </section>

          <section className="approved-section">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">Approved changes</span>
                <h2>{changes.length} ready</h2>
              </div>
              <span className="count-badge">{changes.length}</span>
            </div>
            {changes.length > 0 ? (
              <ol className="change-list">
                {changes.map(change => (
                  <li key={change.changeId}>
                    <span>{change.request}</span>
                    <small>{new Date(change.approvedAt).toLocaleString()}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-copy">Approved changes will collect here.</p>
            )}
          </section>

          <footer>
            <button className="release-button" type="button" disabled>
              Create release
            </button>
            <span>Next: connect a repository</span>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default SidePanel;
