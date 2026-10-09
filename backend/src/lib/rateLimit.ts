import type { Redis } from 'ioredis'
import { env } from './env.js'
import { RateLimitedError } from './errors.js'
import { getRedis } from './redis.js'

interface WindowState {
  count: number
  resetAt: number
}

/** Fixed-window counter storage. `incr` adds `cost` and returns the window after it. */
export interface RateLimitStore {
  incr(key: string, cost: number, windowMs: number, now: number): Promise<WindowState>
  reset(key: string): Promise<void>
}

/** Per-process store. Correct for one instance; each instance counts separately otherwise. */
export class MemoryRateLimitStore implements RateLimitStore {
  private windows = new Map<string, WindowState>()

  constructor(private readonly maxKeys = 10_000) {}

  async incr(key: string, cost: number, windowMs: number, now: number): Promise<WindowState> {
    return this.incrSync(key, cost, windowMs, now)
  }

  incrSync(key: string, cost: number, windowMs: number, now: number): WindowState {
    const window = this.windows.get(key)
    if (!window || window.resetAt <= now) {
      if (this.windows.size >= this.maxKeys) this.prune(now)
      const fresh = { count: cost, resetAt: now + windowMs }
      this.windows.set(key, fresh)
      return { ...fresh }
    }
    window.count += cost
    return { ...window }
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key)
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
    // Still full of live windows: drop the oldest insertions to stay bounded.
    if (this.windows.size >= this.maxKeys) {
      const excess = this.windows.size - Math.floor(this.maxKeys / 2)
      let removed = 0
      for (const key of this.windows.keys()) {
        if (removed++ >= excess) break
        this.windows.delete(key)
      }
    }
  }
}

// INCRBY and the expiry are set atomically, so two instances can't both see a
// "new" window and each start their own.
const INCR_SCRIPT = `
local count = redis.call('INCRBY', KEYS[1], ARGV[1])
if count == tonumber(ARGV[1]) then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`

/**
 * Shared store, so every API instance draws from the same budget. If Redis is
 * unreachable it falls back to the in-process store rather than either
 * blocking all traffic or switching limiting off.
 */
export class RedisRateLimitStore implements RateLimitStore {
  private readonly fallback = new MemoryRateLimitStore()

  constructor(
    private readonly redis: Redis,
    private readonly prefix: string
  ) {}

  async incr(key: string, cost: number, windowMs: number, now: number): Promise<WindowState> {
    try {
      const [count, ttl] = (await this.redis.eval(INCR_SCRIPT, 1, this.prefix + key, cost, windowMs)) as [
        number,
        number,
      ]
      return { count, resetAt: now + (ttl > 0 ? ttl : windowMs) }
    } catch {
      return this.fallback.incr(key, cost, windowMs, now)
    }
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key).catch(() => {})
    await this.fallback.reset(key)
  }
}

export class RateLimiter {
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly store: RateLimitStore = new MemoryRateLimitStore()
  ) {}

  /**
   * Charges `cost` against `key`; throws RateLimitedError once the window is
   * exhausted. `cost` is 1 for "one attempt" limiters and the event count for
   * ingestion, where one request can carry hundreds of events.
   */
  async hit(key: string, cost = 1, now = Date.now()): Promise<void> {
    const window = await this.store.incr(key, cost, this.windowMs, now)
    if (window.count > this.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000))
      throw new RateLimitedError(
        `Too many attempts. Try again in ${retryAfterSeconds}s.`,
        this.limit,
        retryAfterSeconds
      )
    }
  }

  /** Called after a successful attempt so honest users aren't penalised. */
  async reset(key: string): Promise<void> {
    await this.store.reset(key)
  }
}

function storeFor(name: string): RateLimitStore {
  const redis = getRedis()
  return redis ? new RedisRateLimitStore(redis, `ratelimit:${name}:`) : new MemoryRateLimitStore()
}

// 10 attempts per IP+identity every 15 minutes.
export const authRateLimiter = new RateLimiter(10, 15 * 60 * 1000, storeFor('auth'))

// Events per minute per API key.
export const ingestRateLimiter = new RateLimiter(env.INGEST_EVENTS_PER_MINUTE, 60 * 1000, storeFor('ingest'))

// AI analysis calls a paid third-party model per request: a cost bound per tenant.
export const aiAnalysisRateLimiter = new RateLimiter(20, 60 * 60 * 1000, storeFor('ai'))

// Session refreshes per IP. Looser than login: every open tab refreshes on its own.
export const refreshRateLimiter = new RateLimiter(60, 15 * 60 * 1000, storeFor('refresh'))
