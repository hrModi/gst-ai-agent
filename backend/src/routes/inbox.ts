import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()
router.use(authenticate)

// GET /api/inbox — list InboxMessages for tenant (paginated, filterable)
// Query params: status, clientId, month, year, page, limit
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, clientId, month, year, page = '1', limit = '20' } = req.query

    const where: any = { tenantId: req.user!.tenantId }

    // Consultants can only see inbox messages for their assigned clients
    if (req.user!.role === 'CONSULTANT') {
      where.client = { assignedTo: req.user!.id }
    }

    if (status) where.status = status as string
    if (clientId) where.clientId = clientId as string
    if (month) where.month = parseInt(month as string, 10)
    if (year) where.year = parseInt(year as string, 10)

    const pageNum = Math.max(1, parseInt(page as string, 10))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)))
    const skip = (pageNum - 1) * limitNum

    const [messages, total] = await Promise.all([
      prisma.inboxMessage.findMany({
        where,
        include: {
          client: { select: { id: true, legalName: true, gstin: true } },
        },
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.inboxMessage.count({ where }),
    ])

    res.json({
      data: messages,
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    })
  } catch (error) {
    console.error('List inbox messages error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/inbox/unrecognised — YakshActivity errors related to inbox (unrecognised GSTINs)
router.get('/unrecognised', async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query

    const pageNum = Math.max(1, parseInt(page as string, 10))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)))
    const skip = (pageNum - 1) * limitNum

    const where: any = {
      tenantId: req.user!.tenantId,
      activityType: 'ERROR',
      description: { startsWith: 'Unrecognised GSTIN in email:' },
    }

    const [activities, total] = await Promise.all([
      prisma.yakshActivity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.yakshActivity.count({ where }),
    ])

    res.json({
      data: activities,
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    })
  } catch (error) {
    console.error('List unrecognised inbox errors:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
