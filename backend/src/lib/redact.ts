// Data the SDK is allowed to send is bounded by validation.ts, but nothing there
// stops a client from putting a bearer token in a header or a query string. Those
// are stripped here, at the ingest boundary, rather than trusted to never arrive.

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
])

export function redactHeaders(
  headers: Record<string, string> | null | undefined
): Record<string, string> {
  if (!headers) return {}
  const redacted: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? '[REDACTED]' : value
  }
  return redacted
}

const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'auth',
  'session',
  'sessionid',
  'session_id',
  'email',
])

const ABSOLUTE_URL = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//

/**
 * Replaces sensitive query-string values (tokens, session ids, emails, ...)
 * with a placeholder before a URL is persisted or forwarded anywhere.
 * Accepts both absolute page URLs and the relative URLs a request may target.
 */
export function sanitizeUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url, 'http://sanitize-base.invalid')
  } catch {
    return url
  }

  let changed = false
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
      parsed.searchParams.set(key, '[REDACTED]')
      changed = true
    }
  }
  if (!changed) return url

  return ABSOLUTE_URL.test(url) ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`
}
