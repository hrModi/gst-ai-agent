import { prisma } from '../../lib/prisma'
import { validatePurchaseRow } from './validator'

/**
 * Run validation on all purchase data rows for a given client/month/year.
 * Updates each row's validationStatus and creates PurchaseValidationError records.
 * Returns summary counts.
 */
export async function runPurchaseValidation(
  clientId: string,
  month: number,
  year: number,
  tenantId: string
): Promise<{ valid: number; invalid: number; totalErrors: number; total: number }> {
  const allRows = await prisma.purchaseData.findMany({
    where: { clientId, month, year, client: { tenantId } },
  })

  let valid = 0
  let invalid = 0
  let totalErrors = 0

  for (const row of allRows) {
    await prisma.purchaseValidationError.deleteMany({ where: { purchaseDataId: row.id } })

    const errors = validatePurchaseRow(row, allRows)
    const hasErrors = errors.some((e) => e.severity === 'ERROR')

    if (errors.length > 0) {
      await prisma.purchaseValidationError.createMany({
        data: errors.map((e) => ({
          purchaseDataId: row.id,
          errorType: e.errorType,
          fieldName: e.fieldName,
          errorMessage: e.errorMessage,
          severity: e.severity,
        })),
      })
    }

    await prisma.purchaseData.update({
      where: { id: row.id },
      data: { validationStatus: hasErrors ? 'INVALID' : 'VALID' },
    })

    totalErrors += errors.filter((e) => e.severity === 'ERROR').length
    if (hasErrors) invalid++
    else valid++
  }

  return { valid, invalid, totalErrors, total: allRows.length }
}
