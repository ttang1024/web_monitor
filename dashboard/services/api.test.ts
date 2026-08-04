import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, listApiKeys, login, session } from './api';

/** One GraphQL HTTP response. */
function gql(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session', () => {
  it('round-trips and clears both tokens', () => {
    session.save('access-1', 'refresh-1');
    expect(session.token).toBe('access-1');
    expect(session.refreshToken).toBe('refresh-1');

    session.clear();
    expect(session.token).toBeNull();
    expect(session.refreshToken).toBeNull();
  });
});

describe('error handling', () => {
  it('surfaces a GraphQL error as an ApiError carrying its code', async () => {
    fetchMock.mockResolvedValueOnce(
      gql({ errors: [{ message: 'Invalid credentials', extensions: { code: 'UNAUTHENTICATED' } }] })
    );

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

    await expect(login('nope', 'x')).rejects.toMatchObject({
      fields: { email: ['Invalid email address'] },
    });
  });

  // A backend that isn't running is the single most common failure while
  // developing, and it deserves a better message than "fetch failed".
  it('explains an unreachable API rather than leaking the fetch error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await login('a@b.com', 'pw').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK');
    expect((error as ApiError).message).toMatch(/Is the backend running/);
  });
});

describe('login', () => {
  it('stores the tokens it receives', async () => {
    fetchMock.mockResolvedValueOnce(
      gql({ data: { login: { token: 'access-1', refreshToken: 'refresh-1', user: {}, tenant: {} } } })
    );

    await login('a@b.com', 'pw');

    expect(session.token).toBe('access-1');
    expect(session.refreshToken).toBe('refresh-1');
  });
});

describe('token refresh', () => {
  it('rotates the refresh token and replays the original request', async () => {
    session.save('expired-access', 'refresh-1');

    fetchMock
      .mockResolvedValueOnce(
        gql({ errors: [{ message: 'jwt expired', extensions: { code: 'UNAUTHENTICATED' } }] })
      )
      .mockResolvedValueOnce(
        gql({ data: { refreshSession: { token: 'access-2', refreshToken: 'refresh-2', user: {}, tenant: {} } } })
      )
      .mockResolvedValueOnce(gql({ data: { apiKeys: [{ id: 'key-1' }] } }));

    const keys = await listApiKeys();

    expect(keys).toEqual([{ id: 'key-1' }]);
    expect(session.token).toBe('access-2');
    expect(session.refreshToken).toBe('refresh-2');

    // The replay must carry the new access token, not the expired one.
    const replayHeaders = fetchMock.mock.calls[2][1].headers;
    expect(replayHeaders.Authorization).toBe('Bearer access-2');
  });

  it('clears the session when the refresh token is also dead', async () => {
    session.save('expired-access', 'refresh-dead');

    fetchMock
      .mockResolvedValueOnce(
        gql({ errors: [{ message: 'jwt expired', extensions: { code: 'UNAUTHENTICATED' } }] })
      )
      .mockResolvedValueOnce(
        gql({ errors: [{ message: 'Invalid or expired refresh token', extensions: { code: 'UNAUTHENTICATED' } }] })
      );

    await expect(listApiKeys()).rejects.toBeInstanceOf(ApiError);
    expect(session.token).toBeNull();
  });

  it('does not attempt a refresh for non-auth failures', async () => {
    session.save('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(
      gql({ errors: [{ message: 'Alert rule not found', extensions: { code: 'NOT_FOUND' } }] })
    );

    await expect(listApiKeys()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // One call: a NOT_FOUND is not going to be fixed by a fresh token.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a refresh when there is no refresh token', async () => {
    fetchMock.mockResolvedValueOnce(
      gql({ errors: [{ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } }] })
    );

    await expect(listApiKeys()).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
