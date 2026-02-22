/**
 * pipeline.ts — Shared orchestrator for invoice data processing.
 *
 * Called by:
 *  - POST /api/invoices/upload  (fire-and-forget)
 *  - inbox-poll-job              (fire-and-forget, per matched email)
 */
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'
import { validateInvoice, classifyTransaction } from './validation/invoice'
import { generateGSTR1 } from './gstr1/generator'
import { notifyConsultant } from './notification'

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

export interface MappedRow {
  clientId: string
  month: number
  year: number
  invoiceNumber: string
  invoiceDate: string
  buyerGstin: string | null
  buyerName: string | null
  placeOfSupply: string | null
  reverseCharge: boolean
  invoiceValue: number
  taxableValue: number
  taxRate: number
  igstAmount: number
  cgstAmount: number
  sgstAmount: number
  cessAmount: number
  hsnCode: string | null
  description: string | null
  noteType: string | null
  originalInvoice: string | null
  exportType: string | null
  rowNumber: number
}

/**
 * Parse an XLSX or CSV file buffer into mapped row objects.
 * Throws if the file has no data rows.
 */
export function parseInvoiceFile(buffer: Buffer, fileName: string, clientId: string, month: number, year: number): MappedRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet)

  if (rows.length === 0) {
    throw new Error('File contains no data rows')
  }

  return rows.map((row: any, index: number) => ({
    clientId,
    month,
    year,
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
  }))
}

/**
 * Run validation on all invoice rows for a given client/month/year.
 * Updates each row's validationStatus and creates ValidationError records.
 * Updates FilingStatus.stage to VALIDATED or VALIDATION_FAILED.
 * Returns summary counts.
 */
export async function runValidation(
  clientId: string,
  monthNum: number,
  yearNum: number,
  tenantId: string
): Promise<{ valid: number; invalid: number; totalErrors: number; total: number }> {
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

// ─────────────────────────────────────────────
// Main pipeline entry point
// ─────────────────────────────────────────────

export interface PipelineResult {
  valid: number
  invalid: number
  total: number
  stage: string
}

/**
 * Full pipeline: parse → store → validate → (if clean) generate JSON → notify.
 *
 * @param clientId   DB UUID of the client
 * @param month      1–12
 * @param year       e.g. 2026
 * @param fileBuffer Raw bytes of the uploaded XLSX/CSV
 * @param fileName   Original file name (used to pick parser)
 * @param source     'EMAIL' | 'MANUAL'
 * @param tenantId   Tenant UUID
 * @param inboxMessageId  Optional InboxMessage ID to update status on completion
 */
export async function processClientData(
  clientId: string,
  month: number,
  year: number,
  fileBuffer: Buffer,
  fileName: string,
  source: 'EMAIL' | 'MANUAL',
  tenantId: string,
  inboxMessageId?: string
): Promise<PipelineResult> {
  const logActivity = async (activityType: string, description: string, metadata?: object) => {
    await prisma.yakshActivity.create({
      data: { tenantId, clientId, activityType, description, metadata: metadata as any },
    }).catch(console.error)
  }

  try {
    // 1. Upsert filing status → DATA_RECEIVED
    await prisma.filingStatus.upsert({
      where: { clientId_month_year: { clientId, month, year } },
      update: { dataReceived: true, stage: 'DATA_RECEIVED', stageUpdatedAt: new Date() },
      create: { clientId, month, year, dataReceived: true, stage: 'DATA_RECEIVED', stageUpdatedAt: new Date() },
    })

    // 2. Parse file
    const mappedRows = parseInvoiceFile(fileBuffer, fileName, clientId, month, year)

    // 3. Replace existing rows for this period
    await prisma.invoiceData.deleteMany({ where: { clientId, month, year } })
    await prisma.invoiceData.createMany({
      data: mappedRows.map((row) => ({ ...row, validationStatus: 'PENDING' })),
    })

    // 4. Mark validating
    await prisma.filingStatus.update({
      where: { clientId_month_year: { clientId, month, year } },
      data: { stage: 'VALIDATING', stageUpdatedAt: new Date() },
    })
    await logActivity('VALIDATION_RUN', `Yaksh started validation for ${month}/${year} (${source}, ${mappedRows.length} rows)`)

    // 5. Run validation
    const { valid, invalid, totalErrors, total } = await runValidation(clientId, month, year, tenantId)

    let finalStage: string

    if (invalid === 0 && total > 0) {
      // 6. All valid — generate JSON
      await logActivity('JSON_GENERATED', `Yaksh generating GSTR-1 JSON for ${month}/${year}`)
      const gstr1Result = await generateGSTR1(clientId, month, year, tenantId)

      await prisma.filingStatus.upsert({
        where: { clientId_month_year: { clientId, month, year } },
        update: {
          jsonGenerated: true,
          jsonFilePath: gstr1Result.fileName,
          stage: 'READY_TO_FILE',
          gstr1Status: 'JSON_GENERATED',
          stageUpdatedAt: new Date(),
        },
        create: {
          clientId,
          month,
          year,
          jsonGenerated: true,
          jsonFilePath: gstr1Result.fileName,
          stage: 'READY_TO_FILE',
          gstr1Status: 'JSON_GENERATED',
          stageUpdatedAt: new Date(),
        },
      })
      await logActivity('JSON_GENERATED', `GSTR-1 JSON ready for ${month}/${year} (${total} records)`)

      finalStage = 'READY_TO_FILE'

      await notifyConsultant(clientId, 'JSON_READY', { valid, total, month, year })
    } else {
      // 7. Errors — notify consultant
      finalStage = 'VALIDATION_FAILED'
      const errorSummary = `${invalid} errors found`

      await notifyConsultant(clientId, 'VALIDATION_FAILED', { invalid, total, month, year })

      // Update inbox message if applicable
      if (inboxMessageId) {
        await prisma.inboxMessage.update({
          where: { id: inboxMessageId },
          data: { status: 'PROCESSED', pipelineStage: finalStage, errorSummary },
        }).catch(console.error)
      }

      return { valid, invalid, total, stage: finalStage }
    }

    // 8. Update inbox message on success
    if (inboxMessageId) {
      await prisma.inboxMessage.update({
        where: { id: inboxMessageId },
        data: { status: 'PROCESSED', pipelineStage: finalStage },
      }).catch(console.error)
    }

    return { valid, invalid, total, stage: finalStage }
  } catch (err: any) {
    console.error('[Pipeline] Error:', err)

    // Mark inbox message as failed
    if (inboxMessageId) {
      await prisma.inboxMessage.update({
        where: { id: inboxMessageId },
        data: { status: 'FAILED', errorSummary: err.message || 'Pipeline error' },
      }).catch(console.error)
    }

    await prisma.filingStatus.upsert({
      where: { clientId_month_year: { clientId, month, year } },
      update: { stage: 'VALIDATION_FAILED', stageUpdatedAt: new Date() },
      create: { clientId, month, year, stage: 'VALIDATION_FAILED', stageUpdatedAt: new Date() },
    }).catch(console.error)

    throw err
  }
}
