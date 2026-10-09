import express, { type NextFunction, type Request, type Response, Router } from 'express'
import cors from 'cors'
import { env } from './lib/env.js'
import { resolveApiKey } from './lib/apiKey.js'
import {
  AppError,
  BadRequestError,
  RateLimitedError,
  ServiceUnavailableError,
  UnauthorizedError,
} from './lib/errors.js'
import { ingestRateLimiter } from './lib/rateLimit.js'
import { batchEventCount, batchIngestSchema, validate } from './lib/validation.js'
import { ingestBatch } from './services/monitoringService.js'

/**
 * Event ingestion, kept apart from the dashboard's GraphQL API:
 *
 * - CORS: the SDK runs on customers' sites, so any origin may post here. What
 *   restricts a key to its sites is the key's own origin allowlist. No
 *   credentials are involved, so an open CORS policy grants nothing.
 * - Transport: a plain POST with the key in the query string and a text/plain
 *   body is a CORS "simple request" — no preflight round trip per batch — and
 *   is exactly what navigator.sendBeacon sends on page unload.
 * - Load: a bounded number of batches write at once; past that the API sheds
 *   load with 503 + Retry-After instead of queueing until the database pool is
 *   exhausted and the dashboard stalls too.
 */

/** Requests are bounded by bytes first: per-field caps in validation bound the rest. */
const INGEST_BODY_LIMIT = '1mb'

class Semaphore {
  private active = 0
  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.active >= this.max) return false
    this.active += 1
    return true
  }

  release(): void {
    this.active = Math.max(0, this.active - 1)
  }
}

const writers = new Semaphore(env.INGEST_MAX_CONCURRENCY)

function apiKeyFrom(req: Request): string | undefined {
  const header = req.get('x-api-key')
  if (header) return header
  const query = req.query.key
  return typeof query === 'string' && query ? query : undefined
}

function parseBody(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length === 0) throw new BadRequestError('Empty request body')
  try {
    return JSON.parse(raw)
  } catch {
    throw new BadRequestError('Request body is not valid JSON')
  }
}

async function handleIngest(req: Request, res: Response): Promise<void> {
  const apiKey = apiKeyFrom(req)
  if (!apiKey) throw new UnauthorizedError('API Key required')

  const body = parseBody(req.body)
  const { apiKeyId, tenantId } = await resolveApiKey(apiKey, req.get('origin'))

  // Charged before validation: an oversized or malformed batch still costs
  // the sender, or the limiter could be bypassed by sending junk.
  await ingestRateLimiter.hit(apiKeyId, Math.max(batchEventCount(body), 1))
  const batch = validate(batchIngestSchema, body)

  if (!writers.tryAcquire()) throw new ServiceUnavailableError('Ingestion is busy, retry shortly', 2)
  try {
    const result = await ingestBatch(tenantId, batch)
    res.status(202).json(result)
  } finally {
    writers.release()
  }
}

function sendError(error: unknown, req: Request, res: Response): void {
  if (error instanceof AppError) {
    if (error instanceof RateLimitedError || error instanceof ServiceUnavailableError) {
      if (error.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds))
    }
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error instanceof BadRequestError && error.errors ? { fields: error.errors } : {}),
    })
    return
  }

  if ((error as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: `Batch exceeds ${INGEST_BODY_LIMIT}`, code: 'PAYLOAD_TOO_LARGE' })
    return
  }

  req.log?.error({ err: error }, 'ingest failed')
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' })
}

export function ingestRouter(): Router {
  const router = Router()

  router.use(
    cors({
      origin: '*',
      methods: ['POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-API-Key'],
      maxAge: 86_400,
    })
  )
  // Any content type: sendBeacon posts text/plain, fetch may post JSON.
  router.post(
    '/',
    express.text({ type: () => true, limit: INGEST_BODY_LIMIT }),
    (req: Request, res: Response, next: NextFunction) => {
      handleIngest(req, res).catch(next)
    }
  )
  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => sendError(error, req, res))

  return router
}
