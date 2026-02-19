import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()

router.use(authenticate)

// GET /api/agent-activity — list Yaksh activities (paginated, filterable)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { activityType, clientId, page = '1', limit = '50' } = req.query
    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const skip = (pageNum - 1) * limitNum

    const where: any = {
      tenantId: req.user!.tenantId,
    }

    if (activityType) {
      where.activityType = activityType as string
    }

    if (clientId) {
      where.clientId = clientId as string
    }

    // Consultants only see activity for their assigned clients
    if (req.user!.role === 'CONSULTANT') {
      const assignedClientIds = await prisma.client.findMany({
        where: { assignedTo: req.user!.id, tenantId: req.user!.tenantId },
        select: { id: true },
      })
      where.clientId = { in: assignedClientIds.map(c => c.id) }
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
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Get agent activity error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
