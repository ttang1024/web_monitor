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
  ALLOWED_ORIGINS: z.string().default(''),
  ACCESS_TOKEN_TTL: z.string().default('24h'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

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
})

function loadEnv() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const details = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }

  const parsed = result.data

  return {
    ...parsed,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    isProduction: parsed.NODE_ENV === 'production',
  }
}

export const env = loadEnv()
