import { prisma } from '../../lib/prisma'

export async function runStatusInitJob() {
  const now = new Date()
  // Work in IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  const month = istNow.getUTCMonth() + 1
  const year = istNow.getUTCFullYear()

  console.log(`[StatusInitJob] Initialising filing status for ${month}/${year}`)

  try {
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, tenantId: true },
    })

    let created = 0

    for (const client of clients) {
      const result = await prisma.filingStatus.upsert({
        where: { clientId_month_year: { clientId: client.id, month, year } },
        create: {
          clientId: client.id,
          month,
          year,
          stage: 'NOT_STARTED',
          stageUpdatedAt: new Date(),
        },
        update: {}, // never overwrite an existing stage
      })

      // Count as "created" only if the record didn't exist before
      if (result.stage === 'NOT_STARTED' && result.stageUpdatedAt &&
          Math.abs(result.stageUpdatedAt.getTime() - now.getTime()) < 5000) {
        created++
      }
    }

    // Log YakshActivity per tenant
    const tenantIds = [...new Set(clients.map(c => c.tenantId))]
    const clientCountPerTenant: Record<string, number> = {}
    for (const c of clients) {
      clientCountPerTenant[c.tenantId] = (clientCountPerTenant[c.tenantId] || 0) + 1
    }

    for (const tenantId of tenantIds) {
      await prisma.yakshActivity.create({
        data: {
          tenantId,
          activityType: 'NOTIFICATION_SENT',
          description: `Yaksh initialised filing status for ${clientCountPerTenant[tenantId]} clients for ${month}/${year}`,
          metadata: { month, year, clientCount: clientCountPerTenant[tenantId] },
        },
      })
    }

    console.log(`[StatusInitJob] Done. Processed ${clients.length} clients (${created} new records created)`)
  } catch (error) {
    console.error('[StatusInitJob] Error:', error)
  }
}
