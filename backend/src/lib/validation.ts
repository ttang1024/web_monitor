import { z, ZodSchema, ZodTypeAny } from 'zod'
import { BadRequestError } from './errors.js'
import { isAllowedWebhookUrl } from './safeWebhook.js'

/** An absolute http(s) URL. */
const isHttpUrl = (value: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export const registerSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  tenantName: z.string().min(1, 'Tenant name is required').max(200),
  domain: z.string().min(1, 'Domain is required').max(255),
})

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  environment: z.enum(['production', 'staging', 'development']).default('production'),
})

// --- Alerts -----------------------------------------------------------------

const alertCondition = z.enum(['NewIssue', 'ErrorSpike', 'ErrorRate', 'SlowPageLoad'])
const alertSeverity = z.enum(['Info', 'Warning', 'Critical'])

// The webhook is a server-side request to a tenant-chosen URL: http(s) only,
// and never an internal address. Delivery re-checks the resolved address.
const webhookUrl = z
  .string()
  .max(2_048)
  .refine(isHttpUrl, 'Webhook must be an http(s) URL')
  .refine((value) => isAllowedWebhookUrl(value), 'Webhook may not point at a private or internal address')

export const createAlertRuleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  condition: alertCondition,
  threshold: z.number().finite().nonnegative().max(1_000_000).default(0),
  // A window under a minute would re-read the same data every sweep; a month
  // is already far longer than anything worth alerting on.
  windowMinutes: z.number().int().min(1).max(43_200).default(60),
  severity: alertSeverity.default('Warning'),
  cooldownMinutes: z.number().int().min(0).max(43_200).default(60),
  webhookUrl: webhookUrl.nullish(),
  isEnabled: z.boolean().default(true),
})

export const updateAlertRuleSchema = createAlertRuleSchema.partial()

// Origins are stored as written but must parse as absolute http(s) URLs, or the
// allowlist silently matches nothing.
export const allowedOriginsSchema = z
  .array(
    z.string().max(255).refine(isHttpUrl, 'Each origin must be an http(s) URL, e.g. https://app.example.com')
  )
  .max(50, 'At most 50 origins per key')

// --- Ingest -----------------------------------------------------------------
// The SDK is an untrusted client, so everything it sends is bounded here: one
// page cannot push a multi-megabyte row (or a million-item batch) into MySQL.

export const MAX_BATCH_EVENTS = 500

const MAX_MESSAGE = 8_000
const MAX_STACK = 20_000
const MAX_URL = 2_048
const MAX_USER_AGENT = 1_024
const MAX_JSON_BYTES = 16_384

const jsonRecord = (maxBytes = MAX_JSON_BYTES) =>
  z
    .record(z.unknown())
    .refine((value) => JSON.stringify(value).length <= maxBytes, `Payload exceeds ${maxBytes} bytes`)

const timestamp = z.number().finite().nonnegative()
const pageUrl = z.string().min(1).max(MAX_URL)
const userAgent = z.string().max(MAX_USER_AGENT)
// Timings are milliseconds; an hour is already far outside anything real.
const timing = z.number().finite().nonnegative().max(3_600_000).nullish()

const baseEventFields = {
  url: pageUrl,
  userAgent,
  timestamp,
}

export const ingestErrorSchema = z.object({
  ...baseEventFields,
  type: z.string().min(1).max(100),
  message: z.string().min(1).max(MAX_MESSAGE),
  stack: z.string().max(MAX_STACK).nullish(),
  source: z.string().max(MAX_URL).nullish(),
  lineNo: z.number().int().nullish(),
  colNo: z.number().int().nullish(),
  metadata: jsonRecord().nullish(),
})

export const ingestPerformanceSchema = z.object({
  ...baseEventFields,
  navigationType: z.enum(['load', 'route']).nullish(),
  metrics: z.object({
    lcp: timing,
    fcp: timing,
    cls: z.number().finite().nonnegative().max(1_000).nullish(),
    inp: timing,
    ttfb: timing,
    dns: timing,
    tcp: timing,
    response: timing,
    dom: timing,
    load: timing,
  }),
  device: z
    .object({
      type: z.string().max(50).nullish(),
      browser: z.string().max(50).nullish(),
      os: z.string().max(50).nullish(),
      country: z.string().max(50).nullish(),
    })
    .nullish(),
})

export const ingestApiErrorSchema = z.object({
  ...baseEventFields,
  type: z.string().min(1).max(100),
  requestUrl: z.string().min(1).max(MAX_URL),
  method: z.string().min(1).max(10),
  status: z.number().int().min(0).max(999).nullish(),
  durationMs: timing,
  message: z.string().max(MAX_MESSAGE).nullish(),
  requestHeaders: z.record(z.string()).nullish(),
  responseHeaders: z.record(z.string()).nullish(),
})

export const ingestCustomEventSchema = z.object({
  ...baseEventFields,
  name: z.string().min(1).max(100),
  data: jsonRecord(),
  userId: z.string().max(200).nullish(),
  sessionId: z.string().max(200).nullish(),
})

const batchList = <T extends ZodSchema>(schema: T) => z.array(schema).max(MAX_BATCH_EVENTS).nullish()

export const batchIngestSchema = z
  .object({
    // Set by the SDK per batch and reused on retry, so a batch whose first
    // attempt committed is not stored twice.
    batchId: z.string().min(8).max(64).regex(/^[\w-]+$/).nullish(),
    errors: batchList(ingestErrorSchema),
    performance: batchList(ingestPerformanceSchema),
    apiErrors: batchList(ingestApiErrorSchema),
    customEvents: batchList(ingestCustomEventSchema),
  })
  .refine(
    (batch) => batchEventCount(batch) <= MAX_BATCH_EVENTS,
    `Batch may not exceed ${MAX_BATCH_EVENTS} events in total`
  )

export type BatchIngestInput = z.output<typeof batchIngestSchema>
export type IngestErrorInput = z.output<typeof ingestErrorSchema>
export type IngestPerformanceInput = z.output<typeof ingestPerformanceSchema>
export type IngestApiErrorInput = z.output<typeof ingestApiErrorSchema>
export type IngestCustomEventInput = z.output<typeof ingestCustomEventSchema>

/** Number of events in a batch, counted leniently so it also works on unvalidated input. */
export function batchEventCount(input: unknown): number {
  if (!input || typeof input !== 'object') return 0
  const batch = input as Record<string, unknown>
  return ['errors', 'performance', 'apiErrors', 'customEvents'].reduce(
    (sum, key) => sum + (Array.isArray(batch[key]) ? (batch[key] as unknown[]).length : 0),
    0
  )
}

// --- Dashboard --------------------------------------------------------------

export const saveLayoutSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
  configuration: jsonRecord(64 * 1024).nullish(),
})

// --- Team -------------------------------------------------------------------

const userRole = z.enum(['User', 'Admin'])

export const createUserSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: userRole.default('User'),
  // Set by the admin and handed over out of band; the user changes it after signing in.
  initialPassword: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

export const updateUserSchema = z.object({
  role: userRole.optional(),
  isActive: z.boolean().optional(),
})

// --- AI analysis --------------------------------------------------------------
// Only the window is taken from the client; the metrics themselves are read
// from the tenant's own data on the server, so a caller can't feed the model
// numbers of its choosing.

export const aiAnalysisInputSchema = z.object({
  timeRange: z.string().max(50),
  startDate: z.date().nullish(),
  endDate: z.date().nullish(),
})

/**
 * Inferred from the schema's *output* type, not its input. A schema using
 * `.default()` accepts a value the caller may omit but always produces one, and
 * inferring from the input would hand the caller back an optional it then has
 * to re-check.
 */
export function validate<S extends ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const errors: Record<string, string[]> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'input'
      errors[key] = [...(errors[key] ?? []), issue.message]
    }
    throw new BadRequestError('Validation failed', errors)
  }
  return result.data
}
