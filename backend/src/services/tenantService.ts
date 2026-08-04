import type { Tenant } from '@prisma/client'
import { prisma } from '../prisma.js'
import { generateApiKey } from './apiKeyService.js'

function nextMonthlyResetDate(from: Date = new Date()): Date {
  const date = new Date(from)
  date.setMonth(date.getMonth() + 1)
  return date
}

export async function createTenant(name: string, domain: string): Promise<Tenant> {
  const tenant = await prisma.tenant.create({
    data: {
      name,
      domain,
      plan: 'Free',
      isActive: true,
      maxUsers: 5,
      maxApiKeys: 3,
      monthlyEventLimit: 100000n,
      monthlyResetDate: nextMonthlyResetDate(),
    },
  })

  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      name: 'Default API Key',
      key: generateApiKey(),
      environment: 'production',
      isActive: true,
    },
  })

  return tenant
}

export async function incrementEventCount(tenantId: string, count = 1): Promise<void> {
  const now = new Date()

  // Atomic increment while the current monthly window is still open —
  // one query in the common case, and no lost updates under concurrency.
  const updated = await prisma.tenant.updateMany({
    where: { id: tenantId, monthlyResetDate: { gte: now } },
    data: { currentMonthEvents: { increment: count } },
  })

  if (updated.count === 0) {
    // Window elapsed (or tenant missing): start a new month with this batch.
    await prisma.tenant.updateMany({
      where: { id: tenantId },
      data: { currentMonthEvents: count, monthlyResetDate: nextMonthlyResetDate(now) },
    })
  }
}
