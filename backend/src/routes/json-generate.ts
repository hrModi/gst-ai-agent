import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { generateGSTR1 } from '../services/gstr1/generator'
import { createAuditLog } from '../services/audit'
import { AuthRequest } from '../types'

const router = Router()

// All routes require authentication
router.use(authenticate)

// POST /api/json-generate
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, month, year } = req.body
    if (!clientId || !month || !year) {
      res.status(400).json({ error: 'clientId, month, and year are required' })
      return
    }

    const monthNum = parseInt(month, 10)
    const yearNum = parseInt(year, 10)

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

    // Check that there are validated invoices and no errors
    const invalidCount = await prisma.invoiceData.count({
      where: {
        clientId,
        month: monthNum,
        year: yearNum,
        validationStatus: 'INVALID',
        client: { tenantId: req.user!.tenantId },
      },
    })

    if (invalidCount > 0) {
      res.status(400).json({
        error: `Cannot generate JSON: ${invalidCount} invoice(s) have validation errors. Please fix all errors first.`,
      })
      return
    }

    const validCount = await prisma.invoiceData.count({
      where: {
        clientId,
        month: monthNum,
        year: yearNum,
        validationStatus: 'VALID',
        client: { tenantId: req.user!.tenantId },
      },
    })

    if (validCount === 0) {
      res.status(400).json({
        error: 'No validated invoices found for this period',
      })
      return
    }

    // Generate GSTR-1 JSON
    const result = await generateGSTR1(clientId, monthNum, yearNum, req.user!.tenantId)

    // Update filing status
    await prisma.filingStatus.upsert({
      where: {
        clientId_month_year: { clientId, month: monthNum, year: yearNum },
      },
      update: {
        jsonGenerated: true,
        gstr1Status: 'JSON_GENERATED',
      },
      create: {
        clientId,
        month: monthNum,
        year: yearNum,
        dataReceived: true,
        jsonGenerated: true,
        gstr1Status: 'JSON_GENERATED',
      },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'GENERATE_JSON',
      entityType: 'GSTR1',
      entityId: clientId,
      newValue: {
        fileName: result.fileName,
        metadata: result.metadata,
      },
      ipAddress: req.ip,
    })

    res.json({
      data: {
        json: result.json,
        metadata: result.metadata,
        fileName: result.fileName,
      },
    })
  } catch (error) {
    console.error('Generate JSON error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
