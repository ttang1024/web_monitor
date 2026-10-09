import { Redis } from 'ioredis'
import { afterAll, describe, expect, it } from 'vitest'
import { RateLimitedError } from './errors.js'
import { RateLimiter, RedisRateLimitStore } from './rateLimit.js'

const url = process.env.TEST_REDIS_URL

describe.skipIf(!url)('RedisRateLimitStore (Redis)', () => {
  const redis = new Redis(url ?? '')
  const prefix = `test:${Date.now()}:`

  afterAll(() => redis.quit())

  // Two limiters on one Redis stand in for two API instances.
  it('shares one budget across instances', async () => {
    const instanceA = new RateLimiter(3, 60_000, new RedisRateLimitStore(redis, prefix))
    const instanceB = new RateLimiter(3, 60_000, new RedisRateLimitStore(redis, prefix))

    await instanceA.hit('login:ip:a@b.com')
    await instanceB.hit('login:ip:a@b.com')
    await instanceA.hit('login:ip:a@b.com')
    await expect(instanceB.hit('login:ip:a@b.com')).rejects.toBeInstanceOf(RateLimitedError)
  })

  it('expires the window', async () => {
    const limiter = new RateLimiter(1, 200, new RedisRateLimitStore(redis, prefix))
    await limiter.hit('short')
    await expect(limiter.hit('short')).rejects.toBeInstanceOf(RateLimitedError)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(limiter.hit('short')).resolves.toBeUndefined()
  })
})
