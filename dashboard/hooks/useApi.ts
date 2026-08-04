import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../services/api';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Runs `fetcher` whenever `deps` change and tracks loading/error state.
 * Responses that arrive after the inputs changed are discarded, so a slow
 * query for "7d" can't overwrite the fresh "15m" one.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetcher()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Something went wrong loading this data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, refetch };
}
