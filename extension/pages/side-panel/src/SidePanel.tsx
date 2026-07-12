import '@src/SidePanel.css';
import { DoableServerApi, SERVER_BASE_URL, displayError } from '@src/server-api';
import { useEffect, useRef, useState } from 'react';
import type {
  ApprovedWorkspaceChange,
  ContentMessage,
  ExtensionActionResponse,
  ExtensionMessage,
  SelectedComponent,
  StaticSourceWorkspace,
  WorkspacePatch,
} from '@extension/shared';
import type { GitHubStatus, ReleaseApproval, ReleaseResponse, RepositorySummary } from '@src/server-api';

const serverApi = new DoableServerApi();

type BusyAction = 'selecting' | 'previewing' | 'undoing' | 'discarding' | 'approving' | null;
type GitHubBusyAction = 'connecting' | 'binding' | 'disconnecting' | 'releasing' | null;
type ServiceState = 'checking' | 'online' | 'offline';
type Notice = { kind: 'error' | 'success'; text: string } | null;

const sameChangeIds = (approval: ReleaseApproval | null, changes: Array<{ changeId: string }>) =>
  approval?.changeIds.length === changes.length &&
  approval.changeIds.every((changeId, index) => changeId === changes[index]?.changeId);

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
  const [workspaceSource, setWorkspaceSource] = useState<StaticSourceWorkspace | null>(null);
  const [draft, setDraft] = useState<{ request: string; patch: WorkspacePatch } | null>(null);
  const [changes, setChanges] = useState<ApprovedWorkspaceChange[]>([]);
  const [githubStatus, setGitHubStatus] = useState<GitHubStatus | null>(null);
  const [githubError, setGitHubError] = useState('');
  const [repositories, setRepositories] = useState<RepositorySummary[]>([]);
  const [repositoryId, setRepositoryId] = useState('');
  const [installStarted, setInstallStarted] = useState(false);
  const [releaseApproval, setReleaseApproval] = useState<ReleaseApproval | null>(null);
  const [releaseResult, setReleaseResult] = useState<ReleaseResponse | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [githubBusy, setGitHubBusy] = useState<GitHubBusyAction>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const initialReset = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setServerState('checking');
      setHermesState('checking');
      try {
        await serverApi.health();
        if (!active) return;
        setServerState('online');

        initialReset.current ??= serverApi.resetWorkspace();
        await initialReset.current;
        if (!active) return;

        const session = await serverApi.getSession();
        const approvedChanges = await serverApi.getWorkspaceChanges();
        const [hermesResult, githubResult, approvalResult] = await Promise.allSettled([
          serverApi.hermesStatus(),
          serverApi.getGitHubStatus(),
          serverApi.getReleaseApproval(),
        ]);
        if (!active) return;
        setSelection(session.selection);
        setDraft(null);
        setRequest('');
        setChanges(approvedChanges);
        setHermesState(
          hermesResult.status === 'fulfilled' && hermesResult.value.status === 'available' ? 'online' : 'offline',
        );
        setHermesDetail(
          hermesResult.status === 'fulfilled' ? hermesResult.value.detail || '' : displayError(hermesResult.reason),
        );
        setReleaseApproval(
          approvalResult.status === 'fulfilled' && sameChangeIds(approvalResult.value, approvedChanges)
            ? approvalResult.value
            : null,
        );

        if (githubResult.status === 'rejected') {
          setGitHubStatus(null);
          setGitHubError(displayError(githubResult.reason));
          setRepositories([]);
          return;
        }

        const nextGitHubStatus = githubResult.value;
        setGitHubStatus(nextGitHubStatus);
        setGitHubError('');
        setInstallStarted(false);
        if (nextGitHubStatus.repository) {
          try {
            const source = await serverApi.getWorkspaceSource();
            if (!active) return;
            setWorkspaceSource(source);
          } catch (error) {
            if (!active) return;
            setWorkspaceSource(null);
            setGitHubError(displayError(error));
          }
        } else {
          setWorkspaceSource(null);
        }
        if (nextGitHubStatus.connected && !nextGitHubStatus.repository) {
          try {
            const availableRepositories = await serverApi.listGitHubRepositories();
            if (!active) return;
            setRepositories(availableRepositories);
            setRepositoryId(current =>
              availableRepositories.some(repository => String(repository.repositoryId) === current)
                ? current
                : String(availableRepositories[0]?.repositoryId || ''),
            );
          } catch (error) {
            if (!active) return;
            setRepositories([]);
            setGitHubError(displayError(error));
          }
        } else {
          setRepositories([]);
          setRepositoryId('');
        }
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
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') setRefreshKey(value => value + 1);
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

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
          setNotice({ kind: 'success', text: 'Component selected as optional context.' });
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
    if (!workspaceSource || !trimmedRequest) return;

    setNotice(null);
    setBusy('previewing');
    let appliedPatchId: string | null = null;
    try {
      const tab = await getActiveWebTab();
      const { patch, previewDocument } = await serverApi.previewWorkspace(trimmedRequest);
      await sendToTab(tab.id, {
        type: 'DOABLE_APPLY_WORKSPACE_PREVIEW',
        preview: { patchId: patch.patchId, documentHtml: previewDocument, summary: patch.summary },
      });
      appliedPatchId = patch.patchId;
      const screenshot = selection?.screenshotDataUrl || '';
      await serverApi.confirmWorkspacePreview(trimmedRequest, patch, screenshot, screenshot);
      setDraft({ request: trimmedRequest, patch });
      setNotice({ kind: 'success', text: 'Full-page sandbox preview applied.' });
    } catch (error) {
      if (appliedPatchId) {
        const tab = await getActiveWebTab().catch(() => null);
        if (tab) {
          await sendToTab(tab.id, { type: 'DOABLE_CLEAR_WORKSPACE_PREVIEW' }).catch(() => undefined);
        }
      }
      await serverApi.deleteWorkspaceDraft().catch(() => undefined);
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setBusy(null);
    }
  };

  const undoPreview = async () => {
    if (!draft) return;
    setNotice(null);
    setBusy('undoing');
    try {
      const tab = await getActiveWebTab();
      await serverApi.deleteWorkspaceDraft();
      await sendToTab(tab.id, { type: 'DOABLE_CLEAR_WORKSPACE_PREVIEW' });
      setDraft(null);
      setNotice({ kind: 'success', text: 'Preview undone.' });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setBusy(null);
    }
  };

  const discardDraft = async () => {
    if (!draft) return;
    setNotice(null);
    setBusy('discarding');
    try {
      const tab = await getActiveWebTab();
      await serverApi.deleteWorkspaceDraft();
      await sendToTab(tab.id, { type: 'DOABLE_CLEAR_WORKSPACE_PREVIEW' });
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
    if (!draft) return;
    setNotice(null);
    setBusy('approving');
    try {
      const approval = await serverApi.approveWorkspaceChange();
      const nextChanges = [...changes, approval.change];
      const nextReleaseApproval = await serverApi.saveReleaseApproval(
        approval.approvalToken,
        nextChanges.map(change => change.changeId),
      );
      setChanges(nextChanges);
      setReleaseApproval(nextReleaseApproval);
      setReleaseResult(null);
      setDraft(null);
      setRequest('');
      setNotice({ kind: 'success', text: 'Change approved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setBusy(null);
    }
  };

  const connectGitHub = async () => {
    setNotice(null);
    setGitHubBusy('connecting');
    try {
      const { installUrl } = await serverApi.startGitHubInstall();
      await chrome.tabs.create({ url: installUrl });
      setInstallStarted(true);
      setNotice({ kind: 'success', text: 'Finish the GitHub installation, then refresh the connection.' });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setGitHubBusy(null);
    }
  };

  const bindRepository = async () => {
    const selectedRepositoryId = Number(repositoryId);
    if (!Number.isSafeInteger(selectedRepositoryId) || selectedRepositoryId <= 0) return;
    setNotice(null);
    setGitHubBusy('binding');
    try {
      const repository = await serverApi.bindGitHubRepository(selectedRepositoryId);
      const source = await serverApi.getWorkspaceSource();
      setGitHubStatus(current => (current ? { ...current, connected: true, repository } : current));
      setWorkspaceSource(source);
      setGitHubError('');
      setReleaseResult(null);
      setNotice({ kind: 'success', text: `${repository.fullName} selected for release.` });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setGitHubBusy(null);
    }
  };

  const disconnectRepository = async () => {
    setNotice(null);
    setGitHubBusy('disconnecting');
    try {
      await serverApi.disconnectGitHubRepository();
      const status = await serverApi.getGitHubStatus();
      const availableRepositories = status.connected ? await serverApi.listGitHubRepositories() : [];
      setGitHubStatus(status);
      setGitHubError('');
      setRepositories(availableRepositories);
      setRepositoryId(String(availableRepositories[0]?.repositoryId || ''));
      setWorkspaceSource(null);
      setReleaseResult(null);
      setNotice({ kind: 'success', text: 'Repository disconnected from this Doable session.' });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setGitHubBusy(null);
    }
  };

  const createRelease = async () => {
    if (!releaseApproval || !sameChangeIds(releaseApproval, changes) || !githubStatus?.repository) return;
    setNotice(null);
    setReleaseResult(null);
    setGitHubBusy('releasing');
    try {
      const result = await serverApi.release(releaseApproval.approvalToken, releaseApproval.changeIds);
      setReleaseResult(result);
      setNotice({ kind: 'success', text: `Pull request #${result.pullRequestNumber} created. It was not merged.` });
    } catch (error) {
      setNotice({ kind: 'error', text: displayError(error) });
    } finally {
      setGitHubBusy(null);
    }
  };

  const selectedSummary = selection ? componentSummary(selection) : null;
  const stage = !workspaceSource ? 1 : busy === 'previewing' ? 3 : draft ? 4 : changes.length > 0 ? 5 : 2;
  const stages = ['Select', 'Describe', 'Preview', 'Approve'];
  const selectedRepository = repositories.find(repository => String(repository.repositoryId) === repositoryId);
  const releaseReady = Boolean(
    githubStatus?.repository && changes.length > 0 && sameChangeIds(releaseApproval, changes),
  );
  const githubStatusText = !githubStatus
    ? githubError || 'Checking connection...'
    : !githubStatus.configured
      ? 'Server not configured'
      : githubStatus.repository
        ? githubStatus.repository.fullName
        : githubStatus.connected
          ? `Connected as ${githubStatus.account || 'GitHub account'}`
          : 'Not connected';

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
            <div className="status-row">
              <span
                className={`status-dot ${githubStatus?.connected ? 'online' : githubError || githubStatus?.configured === false ? 'offline' : 'disabled'}`}
                aria-hidden="true"
              />
              <span>
                <strong>GitHub</strong>
                <small>{githubStatusText}</small>
              </span>
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
              <p className="empty-copy">Selection is optional. Choose an element when it helps focus the full-page request.</p>
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
            {workspaceSource ? (
              <p className="source-meta">
                <span>{Object.keys(workspaceSource.files).join(', ')}</span>
                <code>{workspaceSource.baseCommitSha.slice(0, 12)}</code>
              </p>
            ) : (
              <p className="release-help">Connect and select a root static-site repository before previewing.</p>
            )}
            <textarea
              id="change-request"
              value={request}
              onChange={event => setRequest(event.target.value)}
              placeholder="Make this call to action clearer and more prominent."
              rows={4}
              maxLength={4000}
              disabled={!workspaceSource || draft !== null || busy !== null}
            />
            <button
              className="primary full-width"
              type="button"
              onClick={() => void previewChange()}
              disabled={!workspaceSource || !request.trim() || draft !== null || busy !== null || hermesState !== 'online'}>
              {busy === 'previewing' ? 'Creating full-page preview...' : 'Preview full page'}
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
                <div className="workspace-files">
                  {Object.keys(draft.patch.files).map(path => (
                    <code key={path}>{path}</code>
                  ))}
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
              <p className="empty-copy">The reversible sandbox preview and exact changed files will appear here.</p>
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

          <section className="release-section" aria-labelledby="release-heading">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">GitHub release</span>
                <h2 id="release-heading">Create a pull request</h2>
              </div>
            </div>

            {!githubStatus ? (
              <p className="release-help">{githubError || 'Checking GitHub connection...'}</p>
            ) : !githubStatus.configured ? (
              <p className="release-help error-copy">
                {githubStatus.detail || 'GitHub App is not configured.'} Set the server environment variables named
                GITHUB_APP_* and refresh.
              </p>
            ) : !githubStatus.connected ? (
              <div className="github-actions">
                <p className="release-help">Install the Doable GitHub App to choose an accessible repository.</p>
                <div className="connection-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void connectGitHub()}
                    disabled={githubBusy !== null}>
                    {githubBusy === 'connecting' ? 'Opening GitHub...' : 'Connect GitHub'}
                  </button>
                  <button className="text-button" type="button" onClick={() => setRefreshKey(value => value + 1)}>
                    Refresh connection
                  </button>
                </div>
                {installStarted && <small>Return here after GitHub confirms the installation.</small>}
              </div>
            ) : !githubStatus.repository ? (
              <div className="repository-picker">
                <label htmlFor="github-repository">Repository</label>
                <select
                  id="github-repository"
                  value={repositoryId}
                  onChange={event => setRepositoryId(event.target.value)}
                  disabled={repositories.length === 0 || githubBusy !== null}>
                  {repositories.length === 0 ? (
                    <option value="">No accessible repositories</option>
                  ) : (
                    repositories.map(repository => (
                      <option key={repository.repositoryId} value={repository.repositoryId}>
                        {repository.fullName} / {repository.defaultBranch} / {repository.private ? 'private' : 'public'}
                      </option>
                    ))
                  )}
                </select>
                {selectedRepository && (
                  <p className="repository-meta">
                    <strong>{selectedRepository.fullName}</strong>
                    <span>{selectedRepository.defaultBranch}</span>
                    <span>{selectedRepository.private ? 'Private' : 'Public'}</span>
                  </p>
                )}
                {githubError && <p className="release-help error-copy">{githubError}</p>}
                <div className="connection-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void bindRepository()}
                    disabled={!repositoryId || githubBusy !== null}>
                    {githubBusy === 'binding' ? 'Selecting...' : 'Use repository'}
                  </button>
                  <button className="text-button" type="button" onClick={() => setRefreshKey(value => value + 1)}>
                    Refresh connection
                  </button>
                </div>
              </div>
            ) : (
              <div className="bound-repository">
                <p className="repository-meta">
                  <strong>{githubStatus.repository.fullName}</strong>
                  <span>{githubStatus.repository.defaultBranch}</span>
                  <span>{githubStatus.repository.private ? 'Private' : 'Public'}</span>
                </p>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void disconnectRepository()}
                  disabled={githubBusy !== null}>
                  {githubBusy === 'disconnecting' ? 'Disconnecting...' : 'Disconnect repository'}
                </button>
              </div>
            )}

            <button
              className="release-button"
              type="button"
              onClick={() => void createRelease()}
              disabled={!releaseReady || githubBusy !== null}>
              {githubBusy === 'releasing' ? 'Creating pull request...' : 'Create pull request'}
            </button>
            {!githubStatus?.repository ? (
              <p className="release-help">Select a repository before release.</p>
            ) : changes.length === 0 ? (
              <p className="release-help">Approve at least one preview before release.</p>
            ) : !sameChangeIds(releaseApproval, changes) ? (
              <p className="release-help">Approve a new preview to refresh release authorization for this ledger.</p>
            ) : (
              <p className="release-help">Creates a branch and pull request only. Doable never merges it.</p>
            )}

            {releaseResult && (
              <div className="release-result" role="status">
                <a href={releaseResult.pullRequestUrl} target="_blank" rel="noreferrer">
                  Pull request #{releaseResult.pullRequestNumber}
                </a>
                <span>Branch: {releaseResult.branch}</span>
                <span>
                  {releaseResult.commitShas.length} {releaseResult.commitShas.length === 1 ? 'commit' : 'commits'}:{' '}
                  {releaseResult.commitShas.map(commitSha => commitSha.slice(0, 7)).join(', ')}
                </span>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default SidePanel;
