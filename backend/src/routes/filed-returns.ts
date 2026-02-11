import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { filedReturnSchema } from '../services/validation/schemas'
import { createAuditLog } from '../services/audit'
import { AuthRequest } from '../types'

const router = Router()

// All routes require authentication
router.use(authenticate)

// POST /api/filed-returns
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.body
    if (!clientId) {
      res.status(400).json({ error: 'clientId is required' })
      return
    }

    const parsed = filedReturnSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return
    }

    // Verify client belongs to tenant
    const clientWhere: any = {
      id: clientId,
      tenantId: req.user!.tenantId,
    }
    if (req.user!.role === 'CONSULTANT') {
      clientWhere.assignedTo = req.user!.id
    }
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const data = parsed.data

    const filedReturn = await prisma.filedReturn.create({
      data: {
        clientId,
        returnType: data.returnType,
        month: data.month,
        year: data.year,
        arn: data.arn,
        filingDate: data.filingDate ? new Date(data.filingDate) : null,
      },
    })

    // Update filing status
    const statusField = data.returnType === 'GSTR1' ? 'gstr1Status' : 'gstr3bStatus'
    await prisma.filingStatus.upsert({
      where: {
        clientId_month_year: {
          clientId,
          month: data.month,
          year: data.year,
        },
      },
      update: {
        [statusField]: 'FILED',
      },
      create: {
        clientId,
        month: data.month,
        year: data.year,
        [statusField]: 'FILED',
      },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'CREATE',
      entityType: 'FILED_RETURN',
      entityId: filedReturn.id,
      newValue: filedReturn,
      ipAddress: req.ip,
    })

    res.status(201).json({ data: filedReturn })
  } catch (error) {
    console.error('Create filed return error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/filed-returns/:clientId
router.get('/:clientId', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params

    // Verify client belongs to tenant
    const clientWhere: any = {
      id: clientId,
      tenantId: req.user!.tenantId,
    }
    if (req.user!.role === 'CONSULTANT') {
      clientWhere.assignedTo = req.user!.id
    }
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const filedReturns = await prisma.filedReturn.findMany({
      where: { clientId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { returnType: 'asc' }],
    })

    res.json({ data: filedReturns })
  } catch (error) {
    console.error('Get filed returns error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
