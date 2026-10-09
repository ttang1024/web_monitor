import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { env } from './lib/env.js'
import { prisma } from './prisma.js'
import { evaluateAlertRules } from './services/alertService.js'
import { pruneExpiredData } from './services/retentionService.js'

export interface Scheduler {
  stop: () => Promise<void>
}

const LEASE_NAME = 'background-sweeps'
const LEASE_TTL_MS = 90_000
const HEARTBEAT_MS = 30_000

/**
 * Leader election through a lease row, so that with several API instances
 * exactly one runs the sweeps (alerts would otherwise fire once per instance).
 * The leader renews every HEARTBEAT_MS; if it dies, another instance takes
 * over once the lease lapses. No extra infrastructure: it is one MySQL row.
 */
export class Lease {
  private held = false
  readonly holder = randomUUID()

  constructor(
    private readonly name: string,
    private readonly ttlMs: number
  ) {}

  get isHeld(): boolean {
    return this.held
  }

  async renew(now = new Date()): Promise<boolean> {
    const expiresAt = new Date(now.getTime() + this.ttlMs)
    try {
      await prisma.schedulerLease.create({ data: { name: this.name, holder: this.holder, expiresAt } })
      this.held = true
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      // Row exists: take it over if it is ours or has lapsed.
      const { count } = await prisma.schedulerLease.updateMany({
        where: { name: this.name, OR: [{ holder: this.holder }, { expiresAt: { lt: now } }] },
        data: { holder: this.holder, expiresAt },
      })
      this.held = count === 1
    }
    return this.held
  }

  async release(): Promise<void> {
    if (!this.held) return
    this.held = false
    await prisma.schedulerLease.deleteMany({ where: { name: this.name, holder: this.holder } }).catch(() => {})
  }
}

/**
 * Runs `task` every `intervalMs`, never overlapping runs, and only while
 * `shouldRun()` says this instance is the leader.
 */
function runOnInterval(
  name: string,
  intervalMs: number,
  shouldRun: () => boolean,
  task: () => Promise<unknown>
): Scheduler {
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  const tick = async (): Promise<void> => {
    if (shouldRun()) {
      try {
        await task()
      } catch (error) {
        console.error(`[scheduler] ${name} failed:`, error instanceof Error ? error.message : error)
      }
    }
    if (stopped) return
    timer = setTimeout(() => void tick(), intervalMs)
    timer.unref()
  }

  timer = setTimeout(() => void tick(), intervalMs)
  timer.unref()

  return {
    stop: async () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}

/**
 * Starts the background work the API owns: alert evaluation and data
 * retention. Every instance may call this; the lease picks one to do the work.
 * Both remain opt-out via env.
 */
export function startScheduler(): Scheduler {
  if (!env.ALERTS_ENABLED && !env.RETENTION_ENABLED) return { stop: async () => {} }

  const lease = new Lease(LEASE_NAME, LEASE_TTL_MS)
  const heartbeat = async () => {
    try {
      const wasHeld = lease.isHeld
      const held = await lease.renew()
      if (held !== wasHeld) console.log(`[scheduler] ${held ? 'acquired' : 'lost'} the sweep lease`)
    } catch (error) {
      console.error('[scheduler] lease renewal failed:', error instanceof Error ? error.message : error)
    }
  }
  void heartbeat()
  const heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_MS)
  heartbeatTimer.unref()

  const schedulers: Scheduler[] = []
  const isLeader = () => lease.isHeld

  if (env.ALERTS_ENABLED) {
    schedulers.push(
      runOnInterval('alert evaluation', env.ALERT_INTERVAL_SECONDS * 1000, isLeader, () => evaluateAlertRules())
    )
  }

  if (env.RETENTION_ENABLED) {
    schedulers.push(
      runOnInterval('retention sweep', env.RETENTION_SWEEP_HOURS * 60 * 60 * 1000, isLeader, async () => {
        const summary = await pruneExpiredData()
        const total = Object.values(summary.deleted).reduce((sum, count) => sum + count, 0)
        if (total > 0) {
          console.log(`[scheduler] retention removed ${total} rows older than ${summary.cutoff.toISOString()}`)
        }
      })
    )
  }

  return {
    stop: async () => {
      clearInterval(heartbeatTimer)
      await Promise.all(schedulers.map((scheduler) => scheduler.stop()))
      // Hand the lease over now rather than making the next leader wait it out.
      await lease.release()
    },
  }
}
