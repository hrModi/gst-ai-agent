import { prisma } from '../lib/prisma'

export async function createAuditLog(params: {
  userId: string
  tenantId: string
  action: string
  entityType: string
  entityId?: string
  oldValue?: any
  newValue?: any
  ipAddress?: string
}) {
  return prisma.auditLog.create({
    data: {
      userId: params.userId,
      tenantId: params.tenantId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValue: params.oldValue ?? undefined,
      newValue: params.newValue ?? undefined,
      ipAddress: params.ipAddress,
    },
  })
}
