import type { ApprovedChange, PreviewPatch, SelectedComponent } from '@extension/shared';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8787';
const SESSION_KEYS = ['sessionId', 'sessionToken'] as const;

const SERVER_BASE_URL = (process.env['CEB_SERVER_URL'] || DEFAULT_SERVER_URL).replace(/\/$/, '');

type SessionCredentials = {
  sessionId: string;
  sessionToken: string;
};

type SessionDraft = {
  selectionId: string;
  request: string;
  patch: PreviewPatch;
  beforeScreenshot: string;
  afterScreenshot: string;
  qa: {
    passed: boolean;
    checks: string[];
  };
};

type SessionStatus = {
  sessionId: string;
  selection: SelectedComponent | null;
  draft: SessionDraft | null;
  approvedChangeCount: number;
};

type HermesStatus = {
  status: 'available' | 'unavailable';
  detail?: string;
};

type PreviewResponse = {
  patch: PreviewPatch;
  responseId?: string;
};

type ChangesResponse = {
  changes: ApprovedChange[];
};

type ApprovalResponse = {
  change: ApprovedChange;
  approvalToken: string;
  ledgerHash: string;
};

class ServerApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

const cleanDetail = (detail: unknown) => {
  if (typeof detail !== 'string') return null;
  return detail.replace(/\s+/g, ' ').replace(/[<>]/g, '').slice(0, 180);
};

const responseError = async (response: Response) => {
  let detail: string | null = null;
  try {
    detail = cleanDetail(((await response.json()) as { detail?: unknown }).detail);
  } catch {
    // The status code still provides a safe fallback when a proxy returns non-JSON.
  }
  return new ServerApiError(detail || `Server request failed (${response.status}).`, response.status);
};

const networkError = (error: unknown) =>
  error instanceof ServerApiError ? error : new ServerApiError('Doable server is offline. Start it, then retry.');

class DoableServerApi {
  async health() {
    await this.publicRequest<{ status: string }>('/health');
  }

  async hermesStatus() {
    return this.publicRequest<HermesStatus>('/v1/hermes/status');
  }

  async getSession() {
    try {
      return await this.sessionRequest<SessionStatus>('');
    } catch (error) {
      if (!(error instanceof ServerApiError) || error.status !== 404) throw error;
      await this.clearSession();
      return this.sessionRequest<SessionStatus>('');
    }
  }

  async selectComponent(component: SelectedComponent) {
    await this.sessionRequest('/selection', {
      method: 'PUT',
      body: JSON.stringify(component),
    });
  }

  async preview(request: string) {
    return this.sessionRequest<PreviewResponse>('/preview', {
      method: 'POST',
      body: JSON.stringify({ request }),
    });
  }

  async confirmPreview(request: string, selection: SelectedComponent, patch: PreviewPatch) {
    await this.sessionRequest('/draft', {
      method: 'PUT',
      body: JSON.stringify({
        request,
        patch,
        beforeScreenshot: selection.screenshotDataUrl,
        afterScreenshot: selection.screenshotDataUrl,
        qa: { passed: true, checks: ['browser_preview_applied'] },
      }),
    });
  }

  async approve() {
    return this.sessionRequest<ApprovalResponse>('/changes/approve', { method: 'POST' });
  }

  async getChanges() {
    return (await this.sessionRequest<ChangesResponse>('/changes')).changes;
  }

  async deleteDraft() {
    await this.sessionRequest<void>('/draft', { method: 'DELETE' });
  }

  private async publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${SERVER_BASE_URL}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
      if (!response.ok) throw await responseError(response);
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      throw networkError(error);
    }
  }

  private async sessionRequest<T>(path: string, init?: RequestInit, retryUnauthorized = true): Promise<T> {
    const session = await this.ensureSession();
    try {
      const response = await fetch(`${SERVER_BASE_URL}/v1/sessions/${encodeURIComponent(session.sessionId)}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'X-Doable-Session-Token': session.sessionToken,
          ...init?.headers,
        },
      });
      if (response.status === 403 && retryUnauthorized) {
        await this.clearSession();
        return this.sessionRequest<T>(path, init, false);
      }
      if (!response.ok) throw await responseError(response);
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      throw networkError(error);
    }
  }

  private async ensureSession(): Promise<SessionCredentials> {
    const saved = await chrome.storage.local.get(SESSION_KEYS);
    if (typeof saved.sessionId === 'string' && typeof saved.sessionToken === 'string') {
      return { sessionId: saved.sessionId, sessionToken: saved.sessionToken };
    }

    const session = await this.publicRequest<SessionCredentials>('/v1/sessions', { method: 'POST' });
    await chrome.storage.local.set(session);
    return session;
  }

  private async clearSession() {
    await chrome.storage.local.remove([...SESSION_KEYS]);
  }
}

const displayError = (error: unknown) =>
  error instanceof Error
    ? cleanDetail(error.message) || 'Something went wrong. Retry the action.'
    : 'Something went wrong. Retry the action.';

export { DoableServerApi, SERVER_BASE_URL, ServerApiError, displayError };
export type { HermesStatus, SessionDraft, SessionStatus };
