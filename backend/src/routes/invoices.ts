import { Router, Response } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { validateInvoice, classifyTransaction } from '../services/validation/invoice'
import { AuthRequest } from '../types'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// GET /api/invoices/sample-template — public, no auth needed (generic file, no tenant data)
router.get('/sample-template', (_req, res: Response) => {
  try {
  const wb = XLSX.utils.book_new()

  // --- Sheet 1: Sample Data ---
  const sampleRows = [
    [
      'Invoice Number', 'Invoice Date', 'Buyer GSTIN', 'Buyer Name', 'Place of Supply',
      'Reverse Charge', 'Invoice Value', 'Taxable Value', 'Tax Rate',
      'IGST Amount', 'CGST Amount', 'SGST Amount', 'Cess Amount',
      'HSN Code', 'Description', 'Note Type', 'Original Invoice', 'Export Type',
    ],
    // B2B — intra-state (CGST + SGST)
    ['INV-001', '15-01-2026', '27AABCU9603R1ZX', '', '27', '', 23600, 20000, 18, 0, 1800, 1800, 0, '9983', 'Consulting Services', '', '', ''],
    // B2B — inter-state (IGST)
    ['INV-002', '16-01-2026', '06AABCU9603R1ZX', '', '06', '', 59000, 50000, 18, 9000, 0, 0, 0, '8471', 'IT Equipment', '', '', ''],
    // B2CS — small unregistered buyer (taxable value ≤ 2,50,000)
    ['INV-003', '17-01-2026', '', 'Walk-in Customer', '27', '', 5900, 5000, 18, 0, 450, 450, 0, '9983', 'Advisory', '', '', ''],
    // B2CL — large unregistered buyer (taxable value > 2,50,000)
    ['INV-004', '18-01-2026', '', 'ABC Traders', '07', '', 354000, 300000, 18, 0, 27000, 27000, 0, '9983', 'Bulk Consulting', '', '', ''],
    // CDNR — credit note against a B2B invoice
    ['CN-001', '20-01-2026', '27AABCU9603R1ZX', '', '27', '', -2360, -2000, 18, 0, -180, -180, 0, '9983', 'Credit Note', 'CREDIT', 'INV-001', ''],
    // EXP — export without payment of tax
    ['EXP-001', '22-01-2026', '', 'Global Corp USA', '', '', 75000, 75000, 0, 0, 0, 0, 0, '8471', 'Software Export', '', '', 'WOPAY'],
  ]

  const ws1 = XLSX.utils.aoa_to_sheet(sampleRows)
  ws1['!cols'] = [
    { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
    { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 },
    { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Sample Data')

  // --- Sheet 2: Instructions ---
  const instructionRows = [
    ['Column', 'Required?', 'Format / Allowed Values', 'Notes'],
    ['Invoice Number', 'REQUIRED', 'Text', 'Must be unique within the same client + month + year'],
    ['Invoice Date', 'REQUIRED', 'DD-MM-YYYY', 'Must be a real date within the filing month; no future dates'],
    ['Buyer GSTIN', 'REQUIRED for B2B', '15-char GST format', 'e.g. 27AABCU9603R1ZX — leave blank for B2C/exports'],
    ['Buyer Name', 'Optional', 'Text', 'Recommended for B2C transactions'],
    ['Place of Supply', 'Optional', '2-digit state code (01–38)', 'e.g. 27 = Maharashtra, 06 = Haryana, 07 = Delhi'],
    ['Reverse Charge', 'Optional', 'Y or blank', 'Y = reverse charge applies'],
    ['Invoice Value', 'Optional', 'Number (INR)', 'Total invoice value including tax'],
    ['Taxable Value', 'REQUIRED', 'Number (INR)', 'Value before tax — must be > 0'],
    ['Tax Rate', 'REQUIRED for tax check', 'Number (percentage)', 'e.g. 18 for 18% GST'],
    ['IGST Amount', 'Conditional', 'Number (INR)', 'Fill for inter-state transactions; leave 0 for intra-state'],
    ['CGST Amount', 'Conditional', 'Number (INR)', 'Fill for intra-state; must equal SGST; leave 0 for inter-state'],
    ['SGST Amount', 'Conditional', 'Number (INR)', 'Fill for intra-state; must equal CGST; leave 0 for inter-state'],
    ['Cess Amount', 'Optional', 'Number (INR)', 'Leave 0 if not applicable'],
    ['HSN Code', 'Optional*', '4, 6, or 8 digit number', '*Recommended; must be numeric if provided'],
    ['Description', 'Optional', 'Text', 'Item or service description'],
    ['Note Type', 'For credit/debit notes', 'CREDIT or DEBIT', 'Classifies row as CDNR — fill Original Invoice too'],
    ['Original Invoice', 'For CDNR only', 'Text', 'Invoice number being reversed'],
    ['Export Type', 'For exports only', 'WPAY or WOPAY', 'WPAY = with payment of tax, WOPAY = without payment'],
    [''],
    ['Transaction Type Auto-Classification', '', '', ''],
    ['Type', 'Condition', '', ''],
    ['CDNR', 'Note Type = CREDIT or DEBIT', '', ''],
    ['EXP', 'Export Type is present (WPAY or WOPAY)', '', ''],
    ['B2B', 'Buyer GSTIN is present and valid', '', ''],
    ['B2CL', 'No GSTIN and Taxable Value > 2,50,000', '', ''],
    ['B2CS', 'No GSTIN and Taxable Value ≤ 2,50,000', '', ''],
  ]

  const ws2 = XLSX.utils.aoa_to_sheet(instructionRows)
  ws2['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 55 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Instructions')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Disposition', 'attachment; filename="sales-data-sample.xlsx"')
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.send(buffer)
  } catch (error) {
    console.error('Sample template error:', error)
    res.status(500).json({ error: 'Failed to generate sample template' })
  }
})

// All remaining routes require authentication
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
