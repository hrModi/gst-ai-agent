import { Router, Response } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { parseGstr2bFile } from '../services/gstr2b/parser'
import { runReconciliation } from '../services/gstr2b/reconciler'
import { createAuditLog } from '../services/audit'
import { AuthRequest } from '../types'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// All routes require auth
router.use(authenticate)

// POST /api/gstr2b/upload
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

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

    // Parse file (throws on error)
    let entries
    try {
      entries = parseGstr2bFile(req.file.buffer, req.file.originalname, clientId, monthNum, yearNum)
    } catch (parseErr: any) {
      res.status(400).json({ error: parseErr.message || 'Failed to parse GSTR-2B file' })
      return
    }

    // Replace existing entries for this period
    await prisma.gstr2bEntry.deleteMany({ where: { clientId, month: monthNum, year: yearNum } })

    // Insert new entries (use createMany with skipDuplicates for safety)
    await prisma.gstr2bEntry.createMany({
      data: entries.map((e) => ({
        ...e,
        matchStatus: 'PENDING',
      })),
      skipDuplicates: true,
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'UPLOAD_GSTR2B',
      entityType: 'GSTR2B',
      entityId: clientId,
      newValue: { month: monthNum, year: yearNum, rowCount: entries.length },
      ipAddress: req.ip,
    })

    res.status(201).json({ data: { uploaded: entries.length } })
  } catch (error) {
    console.error('Upload GSTR-2B error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gstr2b/status — polling endpoint (MUST be before /report/:clientId and /:clientId)
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, month, year } = req.query
    if (!clientId || !month || !year) {
      res.status(400).json({ error: 'clientId, month, and year are required' })
      return
    }

    const monthNum = parseInt(month as string, 10)
    const yearNum = parseInt(year as string, 10)

    const clientWhere: any = { id: clientId as string, tenantId: req.user!.tenantId }
    if (req.user!.role === 'CONSULTANT') clientWhere.assignedTo = req.user!.id
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const total = await prisma.gstr2bEntry.count({
      where: { clientId: clientId as string, month: monthNum, year: yearNum },
    })

    res.json({ data: { total, ready: total > 0 } })
  } catch (error) {
    console.error('Get GSTR-2B status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gstr2b/report/:clientId — MUST be before /:clientId
router.get('/report/:clientId', async (req: AuthRequest, res: Response) => {
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

    const report = await prisma.reconciliationReport.findUnique({
      where: { clientId_month_year: { clientId: String(clientId), month: monthNum, year: yearNum } },
    })

    res.json({ data: report })
  } catch (error) {
    console.error('Get reconciliation report error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/gstr2b/reconcile
router.post('/reconcile', async (req: AuthRequest, res: Response) => {
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

    // Check that GSTR-2B data exists
    const gstr2bCount = await prisma.gstr2bEntry.count({
      where: { clientId, month: monthNum, year: yearNum },
    })
    if (gstr2bCount === 0) {
      res.status(400).json({ error: 'No GSTR-2B data found. Please upload GSTR-2B first.' })
      return
    }

    await runReconciliation(clientId, monthNum, yearNum, req.user!.tenantId)

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'RUN_RECONCILIATION',
      entityType: 'RECONCILIATION',
      entityId: clientId,
      newValue: { month: monthNum, year: yearNum },
      ipAddress: req.ip,
    })

    const report = await prisma.reconciliationReport.findUnique({
      where: { clientId_month_year: { clientId: String(clientId), month: monthNum, year: yearNum } },
    })

    res.json({ data: report })
  } catch (error) {
    console.error('Reconcile error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gstr2b/:clientId — list entries with matchStatus filter
router.get('/:clientId', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { month, year, matchStatus } = req.query

    const clientWhere: any = { id: clientId, tenantId: req.user!.tenantId }
    if (req.user!.role === 'CONSULTANT') clientWhere.assignedTo = req.user!.id
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const where: any = { clientId, client: { tenantId: req.user!.tenantId } }
    if (month) where.month = parseInt(month as string, 10)
    if (year) where.year = parseInt(year as string, 10)
    if (matchStatus) where.matchStatus = matchStatus as string

    const entries = await prisma.gstr2bEntry.findMany({
      where,
      orderBy: [{ supplierGstin: 'asc' }, { invoiceNumber: 'asc' }],
    })

    res.json({ data: entries })
  } catch (error) {
    console.error('Get GSTR-2B entries error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
