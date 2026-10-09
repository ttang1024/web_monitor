import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, listApiKeys, login, logout, restoreSession, session } from './api';

/** One GraphQL HTTP response. */
function gql(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const unauthenticated = (message = 'Authentication required') =>
  gql({ errors: [{ message, extensions: { code: 'UNAUTHENTICATED' } }] });

const refreshed = (token: string) => gql({ data: { refreshSession: { token, user: {}, tenant: {} } } });

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  session.set(null);
  session.onExpired(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('error handling', () => {
  it('surfaces a GraphQL error as an ApiError carrying its code', async () => {
    fetchMock.mockResolvedValueOnce(unauthenticated('Invalid credentials'));

    await expect(login('a@b.com', 'wrong')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid credentials',
      code: 'UNAUTHENTICATED',
    });
  });

  it('carries field errors through for form display', async () => {
    fetchMock.mockResolvedValueOnce(
      gql({
        errors: [
          {
            message: 'Validation failed',
            extensions: { code: 'BAD_USER_INPUT', errors: { email: ['Invalid email address'] } },
          },
        ],
      })
    );

    await expect(login('nope', 'x')).rejects.toMatchObject({ fields: { email: ['Invalid email address'] } });
  });

  it('explains an unreachable API rather than leaking the fetch error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await login('a@b.com', 'pw').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK');
    expect((error as ApiError).message).toMatch(/Is the backend running/);
  });
});

describe('session storage', () => {
  it('keeps the access token in memory only, never in localStorage', async () => {
    fetchMock.mockResolvedValueOnce(gql({ data: { login: { token: 'access-1', user: {}, tenant: {} } } }));

    await login('a@b.com', 'pw');

    expect(session.token).toBe('access-1');
    expect(JSON.stringify({ ...localStorage })).not.toContain('access-1');
  });

  it('sends cookies so the API can set and read the refresh cookie', async () => {
    fetchMock.mockResolvedValueOnce(gql({ data: { login: { token: 'access-1', user: {}, tenant: {} } } }));
    await login('a@b.com', 'pw');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('clears the token on logout even if the API is unreachable', async () => {
    session.set('access-1');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await logout();
    expect(session.token).toBeNull();
  });
});

describe('restoreSession', () => {
  it('exchanges the refresh cookie for an access token after a reload', async () => {
    fetchMock.mockResolvedValueOnce(refreshed('access-2'));

    const payload = await restoreSession();

    expect(payload?.token).toBe('access-2');
    expect(session.token).toBe('access-2');
  });

  it('returns null when there is no session to restore', async () => {
    fetchMock.mockResolvedValueOnce(unauthenticated('No session'));
    expect(await restoreSession()).toBeNull();
    expect(session.token).toBeNull();
  });
});

describe('token refresh', () => {
  it('refreshes and replays the original request with the new token', async () => {
    session.set('expired-access');
    fetchMock
      .mockResolvedValueOnce(unauthenticated('jwt expired'))
      .mockResolvedValueOnce(refreshed('access-2'))
      .mockResolvedValueOnce(gql({ data: { apiKeys: [{ id: 'key-1' }] } }));

    expect(await listApiKeys()).toEqual([{ id: 'key-1' }]);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer access-2');
  });

  // Each refresh rotates the cookie: two in flight at once would make the
  // server see the old cookie reused and end the session.
  it('shares one refresh between concurrent requests', async () => {
    let resolveRefresh: (value: unknown) => void = () => {};
    fetchMock.mockImplementation((_url: string, init: { body: string; headers: Record<string, string> }) => {
      if (init.body.includes('refreshSession')) return new Promise((resolve) => (resolveRefresh = resolve));
      return Promise.resolve(gql({ data: { apiKeys: [] } }));
    });

    const requests = [listApiKeys(), listApiKeys(), listApiKeys()];
    await Promise.resolve();
    resolveRefresh(refreshed('access-3'));
    await Promise.all(requests);

    const refreshCalls = fetchMock.mock.calls.filter(([, init]) => init.body.includes('refreshSession'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('ends the session when the refresh fails too', async () => {
    const expired = vi.fn();
    session.onExpired(expired);
    session.set('expired-access');
    fetchMock
      .mockResolvedValueOnce(unauthenticated('jwt expired'))
      .mockResolvedValueOnce(unauthenticated('Invalid or expired refresh token'));

    await expect(listApiKeys()).rejects.toBeInstanceOf(ApiError);
    expect(session.token).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for non-auth failures', async () => {
    session.set('access-1');
    fetchMock.mockResolvedValueOnce(gql({ errors: [{ message: 'Not found', extensions: { code: 'NOT_FOUND' } }] }));

    await expect(listApiKeys()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
