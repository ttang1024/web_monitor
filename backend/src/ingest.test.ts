import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitedError, UnauthorizedError } from './lib/errors.js'

const resolveApiKey = vi.fn()
const ingestBatch = vi.fn()
const hit = vi.fn()

vi.mock('./lib/apiKey.js', () => ({ resolveApiKey }))
vi.mock('./services/monitoringService.js', () => ({ ingestBatch }))
vi.mock('./lib/rateLimit.js', () => ({ ingestRateLimiter: { hit } }))

const { ingestRouter } = await import('./ingest.js')

let server: Server
let base: string

beforeAll(async () => {
  const app = express()
  app.use('/ingest', ingestRouter())
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ingest`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

beforeEach(() => {
  vi.clearAllMocks()
  resolveApiKey.mockResolvedValue({ apiKeyId: 'key-1', tenantId: 'tenant-1' })
  ingestBatch.mockResolvedValue({ accepted: 1, duplicate: false })
  hit.mockResolvedValue(undefined)
})

const event = { name: 'signup', url: 'https://shop.example/x', userAgent: 'ua', timestamp: Date.now(), data: {} }

function post(body: unknown, { query = '?key=pk_1', headers = {} as Record<string, string> } = {}) {
  return fetch(`${base}${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Origin: 'https://shop.example', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /ingest', () => {
  it('accepts a text/plain batch from any origin (what sendBeacon sends)', async () => {
    const response = await post({ batchId: 'batch-0001', customEvents: [event] })

    expect(response.status).toBe(202)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(resolveApiKey).toHaveBeenCalledWith('pk_1', 'https://shop.example')
    expect(ingestBatch).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ batchId: 'batch-0001' }))
  })

  it('accepts the key as a header too', async () => {
    const response = await post({ customEvents: [event] }, { query: '', headers: { 'X-API-Key': 'pk_2' } })
    expect(response.status).toBe(202)
    expect(resolveApiKey).toHaveBeenCalledWith('pk_2', 'https://shop.example')
  })

  it('answers preflight for any origin without allowing credentials', async () => {
    const response = await fetch(base, {
      method: 'OPTIONS',
      headers: { Origin: 'https://other.example', 'Access-Control-Request-Method': 'POST' },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('rejects a missing key with 401', async () => {
    const response = await post({ customEvents: [event] }, { query: '' })
    expect(response.status).toBe(401)
  })

  it('passes key and origin rejections through as 401', async () => {
    resolveApiKey.mockRejectedValue(new UnauthorizedError('Origin not allowed for this API Key'))
    const response = await post({ customEvents: [event] })
    expect(response.status).toBe(401)
    expect(((await response.json()) as { error: string }).error).toBe('Origin not allowed for this API Key')
  })

  it('rejects malformed JSON and invalid events with 400', async () => {
    expect((await post('{nope')).status).toBe(400)

    const response = await post({ customEvents: [{ ...event, url: '' }] })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { fields?: unknown }).fields).toBeDefined()
    expect(ingestBatch).not.toHaveBeenCalled()
  })

  it('charges the event count to the rate limiter, even for a batch that fails validation', async () => {
    await post({ customEvents: [event, event, { ...event, url: '' }] })
    expect(hit).toHaveBeenCalledWith('key-1', 3)
  })

  it('answers 429 with Retry-After when rate limited', async () => {
    hit.mockRejectedValue(new RateLimitedError('Too many attempts', 6000, 42))
    const response = await post({ customEvents: [event] })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
  })

  it('answers 413 for a body over the limit', async () => {
    const response = await post('x'.repeat(1_100_000))
    expect(response.status).toBe(413)
  })

  it('hides unexpected failures behind a generic 500', async () => {
    ingestBatch.mockRejectedValue(new Error('Table `ErrorLog` is locked'))
    const response = await post({ customEvents: [event] })
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('ErrorLog')
  })

  it('sheds load with 503 + Retry-After once every writer slot is busy', async () => {
    const releases: (() => void)[] = []
    ingestBatch.mockImplementation(
      () => new Promise((resolve) => releases.push(() => resolve({ accepted: 1, duplicate: false })))
    )

    // INGEST_MAX_CONCURRENCY defaults to 8.
    const inFlight = Array.from({ length: 8 }, () => post({ customEvents: [event] }))
    await vi.waitFor(() => expect(releases).toHaveLength(8))

    const shed = await post({ customEvents: [event] })
    expect(shed.status).toBe(503)
    expect(shed.headers.get('retry-after')).toBe('2')

    releases.forEach((release) => release())
    expect((await Promise.all(inFlight)).map((response) => response.status)).toEqual(Array(8).fill(202))

    // Slots are returned once writes finish.
    ingestBatch.mockResolvedValue({ accepted: 1, duplicate: false })
    expect((await post({ customEvents: [event] })).status).toBe(202)
  })
})
