import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { generateApiKey } from './apiKeyService.js'

function nextMonthlyResetDate(from: Date = new Date()): Date {
  const date = new Date(from)
  date.setUTCMonth(date.getUTCMonth() + 1)
  return date
}

export function newTenantData(name: string, domain: string): Prisma.TenantCreateInput {
  return {
    name,
    domain,
    plan: 'Free',
    isActive: true,
    maxUsers: 5,
    maxApiKeys: 3,
    monthlyEventLimit: 100000n,
    monthlyResetDate: nextMonthlyResetDate(),
  }
}

export function defaultApiKeyData(tenantId: string): Prisma.ApiKeyUncheckedCreateInput {
  return { tenantId, name: 'Default API Key', key: generateApiKey(), environment: 'production', isActive: true }
}

/**
 * Adds `count` to the tenant's monthly usage, starting a new month when the
 * window has elapsed. One statement, so concurrent ingests can neither lose
 * increments nor both reset the window. (MySQL evaluates SET left to right;
 * the reset date is assigned last so both conditions read the old value.)
 */
export async function incrementEventCount(
  tenantId: string,
  count: number,
  db: Prisma.TransactionClient = prisma,
  now = new Date()
): Promise<void> {
  const nextReset = nextMonthlyResetDate(now)
  await db.$executeRaw`
    UPDATE \`Tenant\`
       SET currentMonthEvents = IF(monthlyResetDate >= ${now}, currentMonthEvents + ${count}, ${count}),
           monthlyResetDate   = IF(monthlyResetDate >= ${now}, monthlyResetDate, ${nextReset})
     WHERE id = ${tenantId}
  `
}
