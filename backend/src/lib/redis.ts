import { Redis } from 'ioredis'
import { env } from './env.js'

let client: Redis | null | undefined

/**
 * Shared Redis connection, or null when REDIS_URL is unset (single-instance
 * deployments keep their state in process memory instead).
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client
  if (!env.REDIS_URL) {
    client = null
    return client
  }

  client = new Redis(env.REDIS_URL, {
    // Fail a command quickly rather than queueing it while Redis is down; the
    // callers degrade to allowing the request instead of hanging it.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  })
  client.on('error', (error: Error) => console.error('[redis]', error.message))
  return client
}

export async function closeRedis(): Promise<void> {
  if (client) await client.quit().catch(() => {})
  client = undefined
}
