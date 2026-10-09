import { prisma } from '../prisma.js'

const TABLES = [
  'AlertNotification',
  'AlertRule',
  'DashboardLayout',
  'RefreshToken',
  'ErrorBucket',
  'ErrorLog',
  'PerformanceMetric',
  'ApiError',
  'CustomEvent',
  'IngestBatch',
  'SchedulerLease',
  'ApiKey',
  'User',
  'Tenant',
]

/** Empties every table (children first, so foreign keys hold), giving each test a known state. */
export async function resetDatabase(): Promise<void> {
  for (const table of TABLES) await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``)
}

export async function createTenant(id = 'tenant-1', overrides: Record<string, unknown> = {}) {
  return prisma.tenant.create({
    data: {
      id,
      name: 'Acme',
      domain: 'acme.test',
      monthlyResetDate: new Date(Date.now() + 30 * 86_400_000),
      ...overrides,
    },
  })
}
