import { describe, expect, it } from 'vitest'
import { MemoryRateLimitStore, RateLimiter, RedisRateLimitStore } from './rateLimit.js'
import { RateLimitedError } from './errors.js'

describe('RateLimiter', () => {
  it('allows up to the limit and rejects the next attempt', async () => {
    const limiter = new RateLimiter(3, 1_000)
    const now = 1_000_000

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(limiter.hit('login:1.2.3.4:a@b.com', 1, now)).resolves.toBeUndefined()
    }

    await expect(limiter.hit('login:1.2.3.4:a@b.com', 1, now)).rejects.toThrow(RateLimitedError)
  })

  it('keeps windows separate per key', async () => {
    const limiter = new RateLimiter(1, 1_000)
    const now = 1_000_000

    await limiter.hit('login:1.2.3.4:a@b.com', 1, now)
    await expect(limiter.hit('login:1.2.3.4:b@b.com', 1, now)).resolves.toBeUndefined()
    await expect(limiter.hit('login:1.2.3.4:a@b.com', 1, now)).rejects.toThrow(RateLimitedError)
  })

  it('starts a fresh window once the old one elapses', async () => {
    const limiter = new RateLimiter(1, 1_000)
    const now = 1_000_000

    await limiter.hit('key', 1, now)
    await expect(limiter.hit('key', 1, now + 500)).rejects.toThrow(RateLimitedError)
    await expect(limiter.hit('key', 1, now + 1_001)).resolves.toBeUndefined()
  })

  it('clears the window after a successful attempt', async () => {
    const limiter = new RateLimiter(2, 1_000)
    const now = 1_000_000

    await limiter.hit('key', 1, now)
    await limiter.hit('key', 1, now)
    await limiter.reset('key')

    await expect(limiter.hit('key', 1, now)).resolves.toBeUndefined()
    await expect(limiter.hit('key', 1, now)).resolves.toBeUndefined()
  })

  it('tells the caller how long to wait', async () => {
    const limiter = new RateLimiter(1, 60_000)
    const now = 1_000_000

    await limiter.hit('key', 1, now)
    await expect(limiter.hit('key', 1, now + 15_000)).rejects.toThrow(/45s/)
  })

  it('charges the given cost against the window', async () => {
    const limiter = new RateLimiter(100, 1_000)
    const now = 1_000_000

    await limiter.hit('key', 60, now)
    await expect(limiter.hit('key', 30, now)).resolves.toBeUndefined()
    await expect(limiter.hit('key', 30, now)).rejects.toThrow(RateLimitedError)
  })

  it('rejects a single charge larger than the whole limit', async () => {
    const limiter = new RateLimiter(100, 1_000)
    // Even on a fresh window — otherwise an oversized batch that happens to
    // open the window would get through.
    await expect(limiter.hit('key', 500, 1_000_000)).rejects.toThrow(RateLimitedError)
  })

  it('stays bounded when flooded with distinct keys', async () => {
    const store = new MemoryRateLimitStore(100)
    const limiter = new RateLimiter(5, 1_000, store)
    for (let index = 0; index < 500; index++) {
      await limiter.hit(`key-${index}`, 1, 1_000_000 + index)
    }

    const windows = (store as unknown as { windows: Map<string, unknown> }).windows
    expect(windows.size).toBeLessThanOrEqual(100)
  })

  it('falls back to in-process limiting when Redis is unreachable', async () => {
    const brokenRedis = { eval: () => Promise.reject(new Error('down')), del: () => Promise.reject(new Error('down')) }
    const limiter = new RateLimiter(1, 1_000, new RedisRateLimitStore(brokenRedis as never, 'test:'))

    await limiter.hit('key', 1, 1_000_000)
    await expect(limiter.hit('key', 1, 1_000_000)).rejects.toThrow(RateLimitedError)
  })
})
