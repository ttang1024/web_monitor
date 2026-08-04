/**
 * Origin matching for API key allowlists.
 *
 * An ingest key is readable by anyone who views the page source it ships in, so
 * "who holds the key" is not a meaningful check on its own. Pinning a key to the
 * origins it may report from is what stops a copied key from being usable
 * somewhere else.
 */

/** Normalises to `scheme://host[:port]`, or null if the input isn't a URL. */
function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    return url.origin.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Reads the allowlist off an ApiKey row. The column is free-form JSON, so
 * anything that isn't a list of usable origins is treated as "no allowlist"
 * rather than as a list that matches nothing — a malformed value must not
 * silently switch a working key off.
 */
export function parseAllowedOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null)
}

/**
 * An empty allowlist means "any origin": a key is created without one, and the
 * SDK also runs in contexts that send no Origin header at all (same-origin
 * navigations in some browsers, native wrappers, server-side tests). Locking
 * those out by default would break ingestion for anyone who never opts in.
 */
export function isOriginAllowed(allowedOrigins: string[], origin: string | undefined): boolean {
  if (allowedOrigins.length === 0) return true
  if (!origin) return false

  const normalized = normalizeOrigin(origin)
  return normalized !== null && allowedOrigins.includes(normalized)
}
