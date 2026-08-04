import { env } from './lib/env.js'
import { evaluateAlertRules } from './services/alertService.js'
import { pruneExpiredData } from './services/retentionService.js'

export interface Scheduler {
  stop: () => void
}

/**
 * Runs `task` every `intervalMs`, never overlapping runs.
 *
 * setInterval would start a second sweep while the first is still going if a
 * sweep ever runs long — two concurrent retention passes deleting the same rows
 * is exactly the wrong behaviour. Scheduling the next run only after the
 * previous one settles keeps it to one at a time.
 */
function runOnInterval(name: string, intervalMs: number, task: () => Promise<unknown>): Scheduler {
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  const tick = async (): Promise<void> => {
    try {
      await task()
    } catch (error) {
      console.error(`[scheduler] ${name} failed:`, error instanceof Error ? error.message : error)
    }

    if (stopped) return
    timer = setTimeout(() => void tick(), intervalMs)
    // Don't hold the process open just for the next tick.
    timer.unref()
  }

  timer = setTimeout(() => void tick(), intervalMs)
  timer.unref()

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}

/**
 * Starts the background work the API owns: alert evaluation and data
 * retention. Both are opt-out via env, because a deployment running several
 * API instances wants exactly one of them doing this.
 */
export function startScheduler(): Scheduler {
  const schedulers: Scheduler[] = []

  if (env.ALERTS_ENABLED) {
    schedulers.push(
      runOnInterval('alert evaluation', env.ALERT_INTERVAL_SECONDS * 1000, () => evaluateAlertRules())
    )
  }

  if (env.RETENTION_ENABLED) {
    schedulers.push(
      runOnInterval('retention sweep', env.RETENTION_SWEEP_HOURS * 60 * 60 * 1000, async () => {
        const summary = await pruneExpiredData()
        const total = Object.values(summary.deleted).reduce((sum, count) => sum + count, 0)
        if (total > 0) {
          console.log(`[scheduler] retention removed ${total} rows older than ${summary.cutoff.toISOString()}`)
        }
      })
    )
  }

  return { stop: () => schedulers.forEach((scheduler) => scheduler.stop()) }
}
