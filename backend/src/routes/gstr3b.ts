import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { generateGSTR3B } from '../services/gstr3b/generator'
import { createAuditLog } from '../services/audit'
import { AuthRequest } from '../types'

const router = Router()

// All routes require auth
router.use(authenticate)

// POST /api/gstr3b/generate
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, month, year } = req.body
    if (!clientId || !month || !year) {
      res.status(400).json({ error: 'clientId, month, and year are required' })
      return
    }

    const monthNum = parseInt(month, 10)
    const yearNum = parseInt(year, 10)

    const clientWhere: any = { id: clientId, tenantId: req.user!.tenantId }
    if (req.user!.role === 'CONSULTANT') clientWhere.assignedTo = req.user!.id
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    // Check reconciliation has been run
    const report = await prisma.reconciliationReport.findUnique({
      where: { clientId_month_year: { clientId, month: monthNum, year: yearNum } },
    })
    if (!report) {
      res.status(400).json({
        error: 'Reconciliation has not been run yet. Please complete reconciliation first.',
      })
      return
    }

    const result = await generateGSTR3B(clientId, monthNum, yearNum, req.user!.tenantId)

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'GENERATE_GSTR3B',
      entityType: 'GSTR3B',
      entityId: clientId,
      newValue: { fileName: result.fileName, classification: result.summary.classification },
      ipAddress: req.ip,
    })

    res.json({
      data: {
        json: result.json,
        fileName: result.fileName,
        summary: result.summary,
      },
    })
  } catch (error) {
    console.error('Generate GSTR-3B error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gstr3b/download?clientId=&month=&year= — MUST be before /:clientId
router.get('/download', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, month, year } = req.query as { clientId?: string; month?: string; year?: string }
    if (!clientId || !month || !year) {
      res.status(400).json({ error: 'clientId, month, and year are required' })
      return
    }

    const monthNum = parseInt(month, 10)
    const yearNum = parseInt(year, 10)

    const clientWhere: any = { id: clientId, tenantId: req.user!.tenantId }
    if (req.user!.role === 'CONSULTANT') clientWhere.assignedTo = req.user!.id
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const summary = await prisma.gstr3bSummary.findUnique({
      where: { clientId_month_year: { clientId: String(clientId), month: monthNum, year: yearNum } },
    })
    if (!summary || !summary.jsonGenerated) {
      res.status(404).json({ error: 'GSTR-3B JSON not generated yet. Please generate first.' })
      return
    }

    const result = await generateGSTR3B(clientId, monthNum, yearNum, req.user!.tenantId)

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.send(JSON.stringify(result.json, null, 2))
  } catch (error) {
    console.error('Download GSTR-3B error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gstr3b/:clientId?month=&year=
router.get('/:clientId', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { month, year } = req.query
    if (!month || !year) {
      res.status(400).json({ error: 'month and year are required' })
      return
    }

    const monthNum = parseInt(month as string, 10)
    const yearNum = parseInt(year as string, 10)

    const clientWhere: any = { id: clientId, tenantId: req.user!.tenantId }
    if (req.user!.role === 'CONSULTANT') clientWhere.assignedTo = req.user!.id
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const summary = await prisma.gstr3bSummary.findUnique({
      where: { clientId_month_year: { clientId: String(clientId), month: monthNum, year: yearNum } },
    })

    res.json({ data: summary })
  } catch (error) {
    console.error('Get GSTR-3B summary error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
