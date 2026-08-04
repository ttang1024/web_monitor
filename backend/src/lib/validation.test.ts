import { describe, expect, it } from 'vitest'
import { BadRequestError } from './errors.js'
import {
  MAX_BATCH_EVENTS,
  batchIngestSchema,
  createApiKeySchema,
  ingestCustomEventSchema,
  ingestErrorSchema,
  registerSchema,
  validate,
} from './validation.js'

const validError = {
  type: 'js_error',
  message: 'boom',
  url: 'https://example.com/checkout',
  userAgent: 'Mozilla/5.0',
  timestamp: 1_700_000_000_000,
}

describe('validate', () => {
  it('reports every failing field', () => {
    try {
      validate(registerSchema, { email: 'nope', password: 'short' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError)
      const fields = (error as BadRequestError).errors ?? {}
      expect(Object.keys(fields).sort()).toEqual(['domain', 'email', 'firstName', 'lastName', 'password', 'tenantName'])
      expect(fields.email).toContain('Invalid email address')
    }
  })
})

describe('ingest validation', () => {
  it('accepts a well-formed error', () => {
    expect(validate(ingestErrorSchema, validError).message).toBe('boom')
  })

  it('rejects an empty message', () => {
    expect(() => validate(ingestErrorSchema, { ...validError, message: '' })).toThrow(BadRequestError)
  })

  it('rejects a message past the column budget', () => {
    expect(() => validate(ingestErrorSchema, { ...validError, message: 'x'.repeat(8_001) })).toThrow(BadRequestError)
  })

  it('rejects a non-finite or negative timestamp', () => {
    expect(() => validate(ingestErrorSchema, { ...validError, timestamp: Number.NaN })).toThrow(BadRequestError)
    expect(() => validate(ingestErrorSchema, { ...validError, timestamp: -1 })).toThrow(BadRequestError)
  })

  it('caps the JSON blob attached to a custom event', () => {
    const event = {
      ...validError,
      name: 'huge',
      data: { blob: 'x'.repeat(20_000) },
    }
    expect(() => validate(ingestCustomEventSchema, event)).toThrow(BadRequestError)
  })

  it('accepts a batch at the limit and rejects one past it', () => {
    const atLimit = { errors: Array.from({ length: MAX_BATCH_EVENTS }, () => validError) }
    expect(validate(batchIngestSchema, atLimit).errors).toHaveLength(MAX_BATCH_EVENTS)

    const overLimit = { errors: Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => validError) }
    expect(() => validate(batchIngestSchema, overLimit)).toThrow(BadRequestError)
  })

  it('rejects a batch where a single event is malformed', () => {
    const batch = { errors: [validError, { ...validError, url: '' }] }
    expect(() => validate(batchIngestSchema, batch)).toThrow(BadRequestError)
  })
})

describe('createApiKeySchema', () => {
  it('defaults the environment to production', () => {
    expect(validate(createApiKeySchema, { name: 'Storefront' }).environment).toBe('production')
  })

  it('rejects an unknown environment', () => {
    expect(() => validate(createApiKeySchema, { name: 'Storefront', environment: 'prod' })).toThrow(BadRequestError)
  })
})
