import { DoableServerApi } from './server-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DoableServerApi GitHub status', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ sessionId: 'session-1', sessionToken: 'token-1' })),
        },
      },
    });
  });

  it('confirms a pending installation before returning refreshed status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ configured: true, connected: false, pendingAccount: 'kunalshah017' })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ installationId: 123, account: 'kunalshah017' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ configured: true, connected: true, account: 'kunalshah017' })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const status = await new DoableServerApi().getGitHubStatus();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:8787/v1/sessions/session-1/github/install/confirm');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(status).toEqual({ configured: true, connected: true, account: 'kunalshah017' });
  });
});

describe('DoableServerApi workspace', () => {
  it('resets server working state and clears the local approval', async () => {
    const remove = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ sessionId: 'session-1', sessionToken: 'token-1' })),
          remove,
        },
      },
    });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new DoableServerApi().resetWorkspace();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8787/v1/sessions/session-1/workspace');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
    expect(remove).toHaveBeenCalledWith('doableApproval:session-1');
  });
});
