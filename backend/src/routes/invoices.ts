import { Router, Response } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { validateInvoice, classifyTransaction } from '../services/validation/invoice'
import { AuthRequest } from '../types'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// All routes require authentication
router.use(authenticate)

async function runValidation(clientId: string, monthNum: number, yearNum: number, tenantId: string) {
  const allInvoices = await prisma.invoiceData.findMany({
    where: { clientId, month: monthNum, year: yearNum, client: { tenantId } },
  })

  let totalErrors = 0
  let validCount = 0
  let invalidCount = 0

  for (const invoice of allInvoices) {
    await prisma.validationError.deleteMany({ where: { invoiceDataId: invoice.id } })

    const errors = validateInvoice(invoice, allInvoices)
    const txType = classifyTransaction(invoice)
    const hasErrors = errors.some((e) => e.severity === 'ERROR')

    if (errors.length > 0) {
      await prisma.validationError.createMany({
        data: errors.map((e) => ({
          invoiceDataId: invoice.id,
          errorType: e.errorType,
          fieldName: e.fieldName,
          errorMessage: e.errorMessage,
          severity: e.severity,
        })),
      })
    }

    await prisma.invoiceData.update({
      where: { id: invoice.id },
      data: { validationStatus: hasErrors ? 'INVALID' : 'VALID', transactionType: txType },
    })

    totalErrors += errors.filter((e) => e.severity === 'ERROR').length
    if (hasErrors) invalidCount++
    else validCount++
  }

  await prisma.filingStatus.upsert({
    where: { clientId_month_year: { clientId, month: monthNum, year: yearNum } },
    update: {
      dataReceived: true,
      gstr1Status: totalErrors > 0 ? 'VALIDATION_ERRORS' : 'DATA_RECEIVED',
      stage: totalErrors > 0 ? 'VALIDATION_FAILED' : 'DATA_RECEIVED',
      stageUpdatedAt: new Date(),
    },
    create: {
      clientId,
      month: monthNum,
      year: yearNum,
      dataReceived: true,
      gstr1Status: totalErrors > 0 ? 'VALIDATION_ERRORS' : 'DATA_RECEIVED',
      stage: totalErrors > 0 ? 'VALIDATION_FAILED' : 'DATA_RECEIVED',
      stageUpdatedAt: new Date(),
    },
  })

  return { valid: validCount, invalid: invalidCount, totalErrors, total: allInvoices.length }
}

// POST /api/invoices/upload
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

    // Parse Excel/CSV file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet)

    if (rows.length === 0) {
      res.status(400).json({ error: 'File contains no data rows' })
      return
    }

    // Map column names (handle common variations)
    const mapRow = (row: any, index: number) => ({
      clientId,
      month: monthNum,
      year: yearNum,
      invoiceNumber: String(row['Invoice Number'] || row['invoice_number'] || row['InvoiceNumber'] || ''),
      invoiceDate: String(row['Invoice Date'] || row['invoice_date'] || row['InvoiceDate'] || ''),
      buyerGstin: row['Buyer GSTIN'] || row['buyer_gstin'] || row['BuyerGSTIN'] || null,
      buyerName: row['Buyer Name'] || row['buyer_name'] || row['BuyerName'] || null,
      placeOfSupply: row['Place of Supply'] || row['place_of_supply'] || row['POS'] || null,
      reverseCharge: row['Reverse Charge'] === 'Y' || row['reverse_charge'] === true || false,
      invoiceValue: parseFloat(row['Invoice Value'] || row['invoice_value'] || row['InvoiceValue'] || '0'),
      taxableValue: parseFloat(row['Taxable Value'] || row['taxable_value'] || row['TaxableValue'] || '0'),
      taxRate: parseFloat(row['Tax Rate'] || row['tax_rate'] || row['TaxRate'] || '0'),
      igstAmount: parseFloat(row['IGST Amount'] || row['igst_amount'] || row['IGST'] || '0'),
      cgstAmount: parseFloat(row['CGST Amount'] || row['cgst_amount'] || row['CGST'] || '0'),
      sgstAmount: parseFloat(row['SGST Amount'] || row['sgst_amount'] || row['SGST'] || '0'),
      cessAmount: parseFloat(row['Cess Amount'] || row['cess_amount'] || row['CESS'] || '0'),
      hsnCode: row['HSN Code'] || row['hsn_code'] || row['HSN'] || null,
      description: row['Description'] || row['description'] || null,
      noteType: row['Note Type'] || row['note_type'] || null,
      originalInvoice: row['Original Invoice'] || row['original_invoice'] || null,
      exportType: row['Export Type'] || row['export_type'] || null,
      rowNumber: index + 1,
    })

    const mappedRows = rows.map(mapRow)

    // Delete existing records for this period (dedup fix)
    await prisma.invoiceData.deleteMany({
      where: { clientId, month: monthNum, year: yearNum },
    })

    // Create new invoice records with PENDING status
    await prisma.invoiceData.createMany({
      data: mappedRows.map((row) => ({ ...row, validationStatus: 'PENDING' })),
    })

    // Upsert filing status — background validation will update stage further
    await prisma.filingStatus.upsert({
      where: { clientId_month_year: { clientId, month: monthNum, year: yearNum } },
      update: { dataReceived: true, stage: 'DATA_RECEIVED', stageUpdatedAt: new Date() },
      create: {
        clientId,
        month: monthNum,
        year: yearNum,
        dataReceived: true,
        stage: 'DATA_RECEIVED',
        stageUpdatedAt: new Date(),
      },
    })

    res.status(201).json({ data: { uploaded: mappedRows.length } })

    // Fire-and-forget validation — runs after response is sent
    runValidation(clientId, monthNum, yearNum, req.user!.tenantId).catch(console.error)
  } catch (error) {
    console.error('Upload invoices error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/invoices/status — must be before /:clientId to avoid param clash
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, month, year } = req.query
    if (!clientId || !month || !year) {
      res.status(400).json({ error: 'clientId, month, and year are required' })
      return
    }

    const monthNum = parseInt(month as string, 10)
    const yearNum = parseInt(year as string, 10)

    // Verify client belongs to tenant
    const clientWhere: any = {
      id: clientId as string,
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

    const [filingStatus, counts] = await Promise.all([
      prisma.filingStatus.findUnique({
        where: { clientId_month_year: { clientId: clientId as string, month: monthNum, year: yearNum } },
        select: { stage: true },
      }),
      prisma.invoiceData.groupBy({
        by: ['validationStatus'],
        where: { clientId: clientId as string, month: monthNum, year: yearNum },
        _count: true,
      }),
    ])

    const pending = counts.find((c) => c.validationStatus === 'PENDING')?._count ?? 0
    const valid = counts.find((c) => c.validationStatus === 'VALID')?._count ?? 0
    const invalid = counts.find((c) => c.validationStatus === 'INVALID')?._count ?? 0

    res.json({
      data: {
        stage: filingStatus?.stage ?? 'NOT_STARTED',
        validating: pending > 0,
        pending,
        valid,
        invalid,
        total: pending + valid + invalid,
      },
    })
  } catch (error) {
    console.error('Get invoice status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/invoices/validate
router.post('/validate', async (req: AuthRequest, res: Response) => {
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

    // Quick count check before running full validation
    const count = await prisma.invoiceData.count({
      where: { clientId, month: monthNum, year: yearNum },
    })
    if (count === 0) {
      res.status(404).json({ error: 'No invoices found for this period' })
      return
    }

    const result = await runValidation(clientId, monthNum, yearNum, req.user!.tenantId)

    res.json({
      data: {
        totalInvoices: result.total,
        valid: result.valid,
        invalid: result.invalid,
        totalErrors: result.totalErrors,
      },
    })
  } catch (error) {
    console.error('Validate invoices error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/invoices/:clientId
router.get('/:clientId', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params
    const { month, year, validationStatus } = req.query

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

    const invoiceWhere: any = {
      clientId,
      client: { tenantId: req.user!.tenantId },
    }

    if (month) invoiceWhere.month = parseInt(month as string, 10)
    if (year) invoiceWhere.year = parseInt(year as string, 10)
    if (validationStatus) invoiceWhere.validationStatus = validationStatus as string

    const invoices = await prisma.invoiceData.findMany({
      where: invoiceWhere,
      include: {
        validationErrors: true,
      },
      orderBy: [{ rowNumber: 'asc' }, { createdAt: 'asc' }],
    })

    res.json({ data: invoices })
  } catch (error) {
    console.error('Get invoices error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
