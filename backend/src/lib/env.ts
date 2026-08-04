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
