import { RateLimitedError } from './errors.js'

interface Window {
  count: number
  resetAt: number
}

/**
 * Fixed-window limiter kept in process memory. Enough to stop credential
 * stuffing against a single instance; a multi-instance deployment should back
 * this with Redis (the interface is intentionally small enough to swap).
 */
export class RateLimiter {
  private windows = new Map<string, Window>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000
  ) {}

  /** Records one hit for `key`; throws RateLimitedError once the window is exhausted. */
  hit(key: string, now = Date.now()): void {
    const window = this.windows.get(key)

    if (!window || window.resetAt <= now) {
      if (this.windows.size >= this.maxKeys) this.prune(now)
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs })
      return
    }

    window.count += 1
    if (window.count > this.limit) {
      const retryAfterSeconds = Math.ceil((window.resetAt - now) / 1000)
      throw new RateLimitedError(`Too many attempts. Try again in ${retryAfterSeconds}s.`, this.limit)
    }
  }

  /** Called after a successful attempt so honest users aren't penalised. */
  reset(key: string): void {
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

// 10 attempts per IP+identity every 15 minutes.
export const authRateLimiter = new RateLimiter(10, 15 * 60 * 1000)
