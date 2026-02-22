import { Router, Response } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { parsePurchaseFile } from '../services/purchase/parser'
import { runPurchaseValidation } from '../services/purchase/validation-runner'
import { processPurchaseData } from '../services/pipeline'
import { AuthRequest } from '../types'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// GET /api/purchase/sample-template — public, no auth
router.get('/sample-template', (_req, res: Response) => {
  try {
    const wb = XLSX.utils.book_new()

    const sampleRows = [
      [
        'Supplier GSTIN', 'Supplier Name', 'Invoice Number', 'Invoice Date',
        'Invoice Value', 'Taxable Value', 'IGST Amount', 'CGST Amount',
        'SGST Amount', 'Cess Amount', 'HSN Code',
      ],
      // Intra-state (CGST + SGST)
      ['27AABCU9603R1ZX', 'ABC Suppliers Pvt Ltd', 'SUPP-001', '05-01-2026', 23600, 20000, 0, 1800, 1800, 0, '9983'],
      // Inter-state (IGST)
      ['06BBBCD1234E1ZP', 'XYZ Traders', 'SUPP-002', '10-01-2026', 59000, 50000, 9000, 0, 0, 0, '8471'],
    ]

    const ws1 = XLSX.utils.aoa_to_sheet(sampleRows)
    ws1['!cols'] = [
      { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 13 },
      { wch: 13 }, { wch: 12 }, { wch: 10 },
    ]
    XLSX.utils.book_append_sheet(wb, ws1, 'Sample Data')

    const instructionRows = [
      ['Column', 'Required?', 'Format / Notes'],
      ['Supplier GSTIN', 'REQUIRED', '15-char GST format e.g. 27AABCU9603R1ZX'],
      ['Supplier Name', 'Optional', 'Supplier trade/legal name'],
      ['Invoice Number', 'REQUIRED', 'Must be unique per supplier within the period'],
      ['Invoice Date', 'REQUIRED', 'DD-MM-YYYY format'],
      ['Invoice Value', 'Optional', 'Total invoice value including tax (INR)'],
      ['Taxable Value', 'REQUIRED', 'Value before tax — must be > 0 (INR)'],
      ['IGST Amount', 'Conditional', 'For inter-state purchases; leave 0 for intra-state'],
      ['CGST Amount', 'Conditional', 'For intra-state; must equal SGST; leave 0 for inter-state'],
      ['SGST Amount', 'Conditional', 'For intra-state; must equal CGST; leave 0 for inter-state'],
      ['Cess Amount', 'Optional', 'Leave 0 if not applicable'],
      ['HSN Code', 'Optional', '4, 6, or 8 digit numeric HSN/SAC code'],
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(instructionRows)
    ws2['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 50 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Disposition', 'attachment; filename="purchase-data-sample.xlsx"')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.send(buffer)
  } catch (error) {
    console.error('Purchase sample template error:', error)
    res.status(500).json({ error: 'Failed to generate sample template' })
  }
})

// All remaining routes require auth
router.use(authenticate)

// POST /api/purchase/upload
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

    let rowCount: number
    try {
      const rows = parsePurchaseFile(req.file.buffer, req.file.originalname, clientId, monthNum, yearNum)
      rowCount = rows.length
    } catch (parseErr: any) {
      res.status(400).json({ error: parseErr.message || 'Failed to parse file' })
      return
    }

    res.status(201).json({ data: { uploaded: rowCount } })

    // Fire-and-forget pipeline
    processPurchaseData(
      clientId,
      monthNum,
      yearNum,
      req.file.buffer,
      req.file.originalname,
      'MANUAL',
      req.user!.tenantId
    ).catch(console.error)
  } catch (error) {
    console.error('Upload purchase error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/purchase/status — MUST be before /:clientId
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

    const counts = await prisma.purchaseData.groupBy({
      by: ['validationStatus'],
      where: { clientId: clientId as string, month: monthNum, year: yearNum },
      _count: true,
    })

    const pending = counts.find((c) => c.validationStatus === 'PENDING')?._count ?? 0
    const valid = counts.find((c) => c.validationStatus === 'VALID')?._count ?? 0
    const invalid = counts.find((c) => c.validationStatus === 'INVALID')?._count ?? 0

    res.json({
      data: {
        validating: pending > 0,
        pending,
        valid,
        invalid,
        total: pending + valid + invalid,
      },
    })
  } catch (error) {
    console.error('Get purchase status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/purchase/validate
router.post('/validate', async (req: AuthRequest, res: Response) => {
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

    const count = await prisma.purchaseData.count({ where: { clientId, month: monthNum, year: yearNum } })
    if (count === 0) {
      res.status(404).json({ error: 'No purchase data found for this period' })
      return
    }

    const result = await runPurchaseValidation(clientId, monthNum, yearNum, req.user!.tenantId)
    res.json({ data: { total: result.total, valid: result.valid, invalid: result.invalid, totalErrors: result.totalErrors } })
  } catch (error) {
    console.error('Validate purchase error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/purchase/:clientId
router.get('/:clientId', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { month, year, validationStatus } = req.query

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
    if (validationStatus) where.validationStatus = validationStatus as string

    const rows = await prisma.purchaseData.findMany({
      where,
      include: { validationErrors: true },
      orderBy: [{ rowNumber: 'asc' }, { createdAt: 'asc' }],
    })

    res.json({ data: rows })
  } catch (error) {
    console.error('Get purchase data error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
