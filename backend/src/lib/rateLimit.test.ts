import { describe, expect, it } from 'vitest'
import { RateLimiter } from './rateLimit.js'
import { RateLimitedError } from './errors.js'

describe('RateLimiter', () => {
  it('allows up to the limit and rejects the next attempt', () => {
    const limiter = new RateLimiter(3, 1_000)
    const now = 1_000_000

    for (let attempt = 0; attempt < 3; attempt++) {
      expect(() => limiter.hit('login:1.2.3.4:a@b.com', now)).not.toThrow()
    }

    expect(() => limiter.hit('login:1.2.3.4:a@b.com', now)).toThrow(RateLimitedError)
  })

  it('keeps windows separate per key', () => {
    const limiter = new RateLimiter(1, 1_000)
    const now = 1_000_000

    limiter.hit('login:1.2.3.4:a@b.com', now)
    expect(() => limiter.hit('login:1.2.3.4:b@b.com', now)).not.toThrow()
    expect(() => limiter.hit('login:1.2.3.4:a@b.com', now)).toThrow(RateLimitedError)
  })

  it('starts a fresh window once the old one elapses', () => {
    const limiter = new RateLimiter(1, 1_000)
    const now = 1_000_000

    limiter.hit('key', now)
    expect(() => limiter.hit('key', now + 500)).toThrow(RateLimitedError)
    expect(() => limiter.hit('key', now + 1_001)).not.toThrow()
  })

  it('clears the window after a successful attempt', () => {
    const limiter = new RateLimiter(2, 1_000)
    const now = 1_000_000

    limiter.hit('key', now)
    limiter.hit('key', now)
    limiter.reset('key')

    expect(() => limiter.hit('key', now)).not.toThrow()
    expect(() => limiter.hit('key', now)).not.toThrow()
  })

  it('tells the caller how long to wait', () => {
    const limiter = new RateLimiter(1, 60_000)
    const now = 1_000_000

    limiter.hit('key', now)
    expect(() => limiter.hit('key', now + 15_000)).toThrow(/45s/)
  })

  it('stays bounded when flooded with distinct keys', () => {
    const limiter = new RateLimiter(5, 1_000, 100)
    for (let index = 0; index < 500; index++) {
      limiter.hit(`key-${index}`, 1_000_000 + index)
    }

    // An attacker rotating keys must not be able to grow the map without bound.
    const windows = (limiter as unknown as { windows: Map<string, unknown> }).windows
    expect(windows.size).toBeLessThanOrEqual(100)
  })
})
