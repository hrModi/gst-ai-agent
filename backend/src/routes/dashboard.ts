import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()

// All routes require authentication
router.use(authenticate)

// GET /api/dashboard
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    // Build client filter based on role
    const clientWhere: any = {
      tenantId: req.user!.tenantId,
      status: 'ACTIVE',
    }
    if (req.user!.role === 'CONSULTANT') {
      clientWhere.assignedTo = req.user!.id
    }

    // Total active clients
    const totalClients = await prisma.client.count({ where: clientWhere })

    // Get client IDs for filtering
    const clientIds = (
      await prisma.client.findMany({
        where: clientWhere,
        select: { id: true },
      })
    ).map((c) => c.id)

    // Filing statuses for current month
    const filingStatuses = await prisma.filingStatus.findMany({
      where: {
        clientId: { in: clientIds },
        month: currentMonth,
        year: currentYear,
      },
    })

    const pendingFilings = clientIds.length - filingStatuses.filter(
      (fs) => fs.gstr1Status === 'FILED'
    ).length

    const completedFilings = filingStatuses.filter(
      (fs) => fs.gstr1Status === 'FILED'
    ).length

    // Count invoices with validation errors for current month
    const errorCount = await prisma.invoiceData.count({
      where: {
        clientId: { in: clientIds },
        month: currentMonth,
        year: currentYear,
        validationStatus: 'INVALID',
      },
    })

    // Deadline info
    const gstr1Deadline = new Date(currentYear, currentMonth - 1, 11)
    const gstr3bDeadline = new Date(currentYear, currentMonth - 1, 20)

    // If the deadline day has passed in the current month, use next month
    const nextGstr1 = gstr1Deadline < now
      ? new Date(currentMonth === 12 ? currentYear + 1 : currentYear, currentMonth === 12 ? 0 : currentMonth, 11)
      : gstr1Deadline

    const nextGstr3b = gstr3bDeadline < now
      ? new Date(currentMonth === 12 ? currentYear + 1 : currentYear, currentMonth === 12 ? 0 : currentMonth, 20)
      : gstr3bDeadline

    const daysToGstr1 = Math.max(0, Math.ceil((nextGstr1.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    const daysToGstr3b = Math.max(0, Math.ceil((nextGstr3b.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

    // Recent activity (last 10 audit logs)
    const recentActivity = await prisma.auditLog.findMany({
      where: { tenantId: req.user!.tenantId },
      include: {
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    // Filing status summary
    const statusSummary = {
      notStarted: filingStatuses.filter((fs) => fs.gstr1Status === 'NOT_STARTED').length +
        (clientIds.length - filingStatuses.length),
      dataReceived: filingStatuses.filter((fs) => fs.gstr1Status === 'DATA_RECEIVED').length,
      validationErrors: filingStatuses.filter((fs) => fs.gstr1Status === 'VALIDATION_ERRORS').length,
      jsonGenerated: filingStatuses.filter((fs) => fs.gstr1Status === 'JSON_GENERATED').length,
      filed: filingStatuses.filter((fs) => fs.gstr1Status === 'FILED').length,
      nilReturn: filingStatuses.filter((fs) => fs.gstr1Status === 'NIL_RETURN').length,
    }

    res.json({
      data: {
        totalClients,
        pendingFilings,
        completedFilings,
        errorCount,
        currentPeriod: {
          month: currentMonth,
          year: currentYear,
        },
        deadlineInfo: {
          gstr1: {
            date: nextGstr1.toISOString().split('T')[0],
            daysRemaining: daysToGstr1,
          },
          gstr3b: {
            date: nextGstr3b.toISOString().split('T')[0],
            daysRemaining: daysToGstr3b,
          },
        },
        statusSummary,
        recentActivity: recentActivity.map((log) => ({
          id: log.id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          userName: log.user.name,
          createdAt: log.createdAt,
        })),
      },
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
