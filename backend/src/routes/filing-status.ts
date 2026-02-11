import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { filingStatusUpdateSchema } from '../services/validation/schemas'
import { createAuditLog } from '../services/audit'
import { AuthRequest } from '../types'

const router = Router()

// All routes require authentication
router.use(authenticate)

// GET /api/filing-status
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query

    if (!month || !year) {
      res.status(400).json({ error: 'month and year query parameters are required' })
      return
    }

    const monthNum = parseInt(month as string, 10)
    const yearNum = parseInt(year as string, 10)

    // Build client filter based on role
    const clientWhere: any = {
      tenantId: req.user!.tenantId,
      status: 'ACTIVE',
    }
    if (req.user!.role === 'CONSULTANT') {
      clientWhere.assignedTo = req.user!.id
    }

    // Fetch all active clients with their filing status for the period
    const clients = await prisma.client.findMany({
      where: clientWhere,
      include: {
        assignedUser: { select: { id: true, name: true } },
        filingStatus: {
          where: { month: monthNum, year: yearNum },
        },
      },
      orderBy: { legalName: 'asc' },
    })

    // Build a grid-friendly response
    const grid = clients.map((client) => {
      const status = client.filingStatus[0] || null
      return {
        clientId: client.id,
        gstin: client.gstin,
        legalName: client.legalName,
        tradeName: client.tradeName,
        assignedUser: client.assignedUser,
        filingStatusId: status?.id || null,
        gstr1Status: status?.gstr1Status || 'NOT_STARTED',
        gstr3bStatus: status?.gstr3bStatus || 'NOT_STARTED',
        dataReceived: status?.dataReceived || false,
        jsonGenerated: status?.jsonGenerated || false,
        notes: status?.notes || null,
      }
    })

    res.json({ data: grid })
  } catch (error) {
    console.error('Get filing status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/filing-status/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = filingStatusUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return
    }

    // Verify filing status belongs to a client in this tenant
    const existing = await prisma.filingStatus.findFirst({
      where: {
        id: req.params.id,
        client: { tenantId: req.user!.tenantId },
      },
    })

    if (!existing) {
      res.status(404).json({ error: 'Filing status not found' })
      return
    }

    const data = parsed.data
    const updated = await prisma.filingStatus.update({
      where: { id: req.params.id },
      data: {
        ...(data.gstr1Status !== undefined && { gstr1Status: data.gstr1Status }),
        ...(data.gstr3bStatus !== undefined && { gstr3bStatus: data.gstr3bStatus }),
        ...(data.dataReceived !== undefined && { dataReceived: data.dataReceived }),
        ...(data.jsonGenerated !== undefined && { jsonGenerated: data.jsonGenerated }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'UPDATE',
      entityType: 'FILING_STATUS',
      entityId: updated.id,
      oldValue: existing,
      newValue: updated,
      ipAddress: req.ip,
    })

    res.json({ data: updated })
  } catch (error) {
    console.error('Update filing status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
