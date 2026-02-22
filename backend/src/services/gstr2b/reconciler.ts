import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../../lib/prisma'

const MATCH_TOLERANCE = 1 // ±1 INR

function toNumber(val: Decimal | number): number {
  if (typeof val === 'number') return val
  return Number(val.toString())
}

function isWithinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= MATCH_TOLERANCE
}

/**
 * Run reconciliation for a client/month/year.
 * Matches GSTR-2B entries against purchase register rows.
 * Updates Gstr2bEntry.matchStatus and upserts ReconciliationReport.
 */
export async function runReconciliation(
  clientId: string,
  month: number,
  year: number,
  tenantId: string
): Promise<void> {
  // 1. Fetch all VALID purchase data rows for the period
  const purchaseRows = await prisma.purchaseData.findMany({
    where: {
      clientId,
      month,
      year,
      validationStatus: 'VALID',
      client: { tenantId },
    },
  })

  // 2. Fetch all GSTR-2B entries for the period
  const gstr2bRows = await prisma.gstr2bEntry.findMany({
    where: {
      clientId,
      month,
      year,
      client: { tenantId },
    },
  })

  // 3. Build lookup map from purchase register: `${supplierGstin}::${invoiceNumber}` → row
  const purchaseMap = new Map<string, typeof purchaseRows[0]>()
  for (const row of purchaseRows) {
    const key = `${row.supplierGstin.toUpperCase()}::${row.invoiceNumber}`
    purchaseMap.set(key, row)
  }

  // 4. Track which purchase rows were matched
  const matchedPurchaseKeys = new Set<string>()

  let matched = 0
  let mismatched = 0
  let missingInPurchase = 0
  let totalItcAvailable = 0
  let totalItcMismatch = 0

  // 5. For each GSTR-2B entry, find match in purchase register
  for (const entry of gstr2bRows) {
    const key = `${entry.supplierGstin.toUpperCase()}::${entry.invoiceNumber}`
    const purchaseRow = purchaseMap.get(key)

    let matchStatus: string

    if (!purchaseRow) {
      // Invoice in GSTR-2B but not in purchase register
      matchStatus = 'MISSING_IN_PURCHASE'
      missingInPurchase++
      // ITC is at risk — count in mismatch
      totalItcMismatch += toNumber(entry.itcAvailable)
    } else {
      matchedPurchaseKeys.add(key)

      const taxValMatch = isWithinTolerance(
        toNumber(purchaseRow.taxableValue),
        toNumber(entry.taxableValue)
      )
      const igstMatch = isWithinTolerance(
        toNumber(purchaseRow.igstAmount),
        toNumber(entry.igstAmount)
      )
      const cgstMatch = isWithinTolerance(
        toNumber(purchaseRow.cgstAmount),
        toNumber(entry.cgstAmount)
      )
      const sgstMatch = isWithinTolerance(
        toNumber(purchaseRow.sgstAmount),
        toNumber(entry.sgstAmount)
      )

      if (taxValMatch && igstMatch && cgstMatch && sgstMatch) {
        matchStatus = 'MATCHED'
        matched++
        totalItcAvailable += toNumber(entry.itcAvailable)
      } else {
        matchStatus = 'MISMATCHED'
        mismatched++
        totalItcMismatch += toNumber(entry.itcAvailable)
      }
    }

    await prisma.gstr2bEntry.update({
      where: { id: entry.id },
      data: { matchStatus },
    })
  }

  // 6. Purchase rows not matched by any GSTR-2B entry → EXTRA_IN_PURCHASE
  let extraInPurchase = 0
  for (const row of purchaseRows) {
    const key = `${row.supplierGstin.toUpperCase()}::${row.invoiceNumber}`
    if (!matchedPurchaseKeys.has(key)) {
      extraInPurchase++
      // Create a synthetic Gstr2bEntry with EXTRA_IN_PURCHASE status
      await prisma.gstr2bEntry.upsert({
        where: {
          clientId_month_year_supplierGstin_invoiceNumber: {
            clientId,
            month,
            year,
            supplierGstin: row.supplierGstin,
            invoiceNumber: row.invoiceNumber,
          },
        },
        update: { matchStatus: 'EXTRA_IN_PURCHASE' },
        create: {
          clientId,
          month,
          year,
          supplierGstin: row.supplierGstin,
          supplierName: row.supplierName,
          invoiceNumber: row.invoiceNumber,
          invoiceDate: row.invoiceDate,
          invoiceValue: row.invoiceValue,
          taxableValue: row.taxableValue,
          igstAmount: row.igstAmount,
          cgstAmount: row.cgstAmount,
          sgstAmount: row.sgstAmount,
          cessAmount: row.cessAmount,
          itcAvailable: 0,
          matchStatus: 'EXTRA_IN_PURCHASE',
        },
      })
    }
  }

  // 7. Upsert ReconciliationReport
  await prisma.reconciliationReport.upsert({
    where: { clientId_month_year: { clientId, month, year } },
    update: {
      totalPurchase: purchaseRows.length,
      totalGstr2b: gstr2bRows.length,
      matched,
      mismatched,
      missingInPurchase,
      extraInPurchase,
      totalItcAvailable,
      totalItcMismatch,
    },
    create: {
      clientId,
      month,
      year,
      totalPurchase: purchaseRows.length,
      totalGstr2b: gstr2bRows.length,
      matched,
      mismatched,
      missingInPurchase,
      extraInPurchase,
      totalItcAvailable,
      totalItcMismatch,
    },
  })
}
