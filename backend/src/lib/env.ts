import 'dotenv/config'
import { z } from 'zod'

// Every environment variable the API depends on is parsed once, here, so a
// misconfigured deployment fails at boot instead of on the first request.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Origins allowed to call the dashboard API (/graphql). Ingestion (/ingest)
  // has its own policy: any origin, restricted per API key instead.
  ALLOWED_ORIGINS: z.string().default(''),
  // Express "trust proxy": how many reverse proxies sit in front of the API
  // (e.g. 1), or a comma-separated list of proxy addresses/subnets. Defaults to
  // trusting none, so X-Forwarded-For cannot be forged to dodge rate limits.
  TRUST_PROXY: z.string().default('false'),
  // Short-lived: access tokens are only revocable through tokenVersion, and the
  // refresh cookie quietly renews them.
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // SameSite for the refresh-token cookie. "lax" works when the dashboard and
  // API share a site; use "none" (HTTPS only) when they are on different sites.
  REFRESH_COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),

  // Shared state for rate limits when several API instances run. Without it
  // each instance limits on its own (fine for a single instance).
  REDIS_URL: z.string().optional(),

  // Ingest requests allowed to write at once per instance. Beyond this the API
  // answers 503 + Retry-After rather than letting ingestion take every database
  // connection away from the dashboard.
  INGEST_MAX_CONCURRENCY: z.coerce.number().int().positive().default(8),

  // Alert webhooks may not target private, loopback or link-local addresses
  // unless this is set (local development against a webhook on localhost).
  WEBHOOK_ALLOW_PRIVATE_NETWORKS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // Ingest throttling, per API key. The monthly quota alone lets one page burn
  // a month of allowance in minutes, which this bounds.
  INGEST_EVENTS_PER_MINUTE: z.coerce.number().int().positive().default(6000),

  // A deeply nested query costs the database far more than it costs the client
  // to send. Rejected before execution.
  MAX_QUERY_DEPTH: z.coerce.number().int().positive().default(12),

  // Retention. Event tables are append-only and would otherwise grow forever.
  RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  RETENTION_SWEEP_HOURS: z.coerce.number().int().positive().default(24),
  RETENTION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // Alert evaluation runs on a timer rather than on the ingest path.
  ALERTS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  ALERT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),

  // Optional: the AI Insights panel is disabled (returns a clear error) without it.
  // Held server-side only — it must never be shipped to the browser bundle.
  GEMINI_API_KEY: z.string().optional(),
})

function loadEnv() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const details = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }

  const parsed = result.data

  if (parsed.REFRESH_COOKIE_SAMESITE === 'none' && parsed.NODE_ENV !== 'production') {
    // Browsers reject SameSite=None without Secure, and Secure needs HTTPS.
    console.warn('REFRESH_COOKIE_SAMESITE=none requires HTTPS; the cookie is only marked Secure in production.')
  }

  return {
    ...parsed,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: parseTrustProxy(parsed.TRUST_PROXY),
    isProduction: parsed.NODE_ENV === 'production',
  }
}

/** Maps TRUST_PROXY onto what Express's "trust proxy" setting accepts. */
export function parseTrustProxy(value: string): boolean | number | string[] {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'false') return false
  // "true" trusts every hop, which makes the client address forgeable again.
  if (trimmed === 'true') throw new Error('TRUST_PROXY=true is unsafe; set the number of proxy hops instead')
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export const env = loadEnv()
