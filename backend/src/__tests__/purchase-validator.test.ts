/**
 * Test Group 24: Purchase Data Validator — unit tests
 * Directly tests validatePurchaseRow() without DB interaction.
 */

import { validatePurchaseRow } from '../services/purchase/validator'

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRow(overrides: Record<string, any> = {}) {
  return {
    id: 'row-1',
    invoiceNumber: 'SUPP-001',
    invoiceDate: '05-01-2026',
    supplierGstin: '27AABCU9603R1ZX',
    taxableValue: 20000,
    igstAmount: 0,
    cgstAmount: 1800,
    sgstAmount: 1800,
    hsnCode: '9983',
    month: 1,
    year: 2026,
    rowNumber: 1,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('validatePurchaseRow — unit tests', () => {
  test('24.1 — Valid row produces no errors', () => {
    const row = makeRow()
    const errors = validatePurchaseRow(row, [row])

    expect(errors.filter((e) => e.severity === 'ERROR')).toHaveLength(0)
  })

  test('24.2 — Empty supplier GSTIN produces required_field ERROR', () => {
    const row = makeRow({ supplierGstin: '' })
    const errors = validatePurchaseRow(row, [row])

    const gstinError = errors.find((e) => e.fieldName === 'supplier_gstin' && e.severity === 'ERROR')
    expect(gstinError).toBeDefined()
    expect(gstinError!.errorType).toBe('required_field')
  })

  test('24.3 — Invalid GSTIN format produces gstin_format ERROR', () => {
    const row = makeRow({ supplierGstin: 'INVALID123' })
    const errors = validatePurchaseRow(row, [row])

    const gstinError = errors.find((e) => e.errorType === 'gstin_format')
    expect(gstinError).toBeDefined()
    expect(gstinError!.severity).toBe('ERROR')
  })

  test('24.4 — Missing invoice number produces required_field ERROR', () => {
    const row = makeRow({ invoiceNumber: '' })
    const errors = validatePurchaseRow(row, [row])

    const invError = errors.find((e) => e.fieldName === 'invoice_number' && e.severity === 'ERROR')
    expect(invError).toBeDefined()
  })

  test('24.5 — Wrong date format produces date_format ERROR', () => {
    const row = makeRow({ invoiceDate: '2026-01-05' }) // ISO format instead of DD-MM-YYYY
    const errors = validatePurchaseRow(row, [row])

    const dateError = errors.find((e) => e.errorType === 'date_format' && e.severity === 'ERROR')
    expect(dateError).toBeDefined()
    expect(dateError!.errorMessage).toMatch(/DD-MM-YYYY/i)
  })

  test('24.6 — Invalid calendar date produces date_format ERROR', () => {
    const row = makeRow({ invoiceDate: '31-02-2026' }) // Feb 31 doesn't exist
    const errors = validatePurchaseRow(row, [row])

    const dateError = errors.find((e) => e.errorType === 'date_format' && e.severity === 'ERROR')
    expect(dateError).toBeDefined()
  })

  test('24.7 — CGST ≠ SGST produces tax_calculation ERROR', () => {
    const row = makeRow({ cgstAmount: 1800, sgstAmount: 1000 }) // unequal CGST/SGST
    const errors = validatePurchaseRow(row, [row])

    const taxError = errors.find((e) => e.errorType === 'tax_calculation' && e.fieldName === 'cgst_sgst')
    expect(taxError).toBeDefined()
    expect(taxError!.severity).toBe('ERROR')
  })

  test('24.8 — Both IGST and CGST/SGST set produces tax_calculation WARNING', () => {
    const row = makeRow({ igstAmount: 3600, cgstAmount: 1800, sgstAmount: 1800 })
    const errors = validatePurchaseRow(row, [row])

    const mixError = errors.find((e) => e.errorType === 'tax_calculation' && e.fieldName === 'tax_amounts')
    expect(mixError).toBeDefined()
    expect(mixError!.severity).toBe('WARNING')
  })

  test('24.9 — HSN code with wrong digit count produces hsn_code ERROR', () => {
    const row = makeRow({ hsnCode: '123' }) // 3 digits — not 4/6/8
    const errors = validatePurchaseRow(row, [row])

    const hsnError = errors.find((e) => e.errorType === 'hsn_code' && e.severity === 'ERROR')
    expect(hsnError).toBeDefined()
    expect(hsnError!.errorMessage).toMatch(/4, 6, or 8 digits/)
  })

  test('24.10 — Non-numeric HSN code produces hsn_code ERROR', () => {
    const row = makeRow({ hsnCode: 'ABCD' })
    const errors = validatePurchaseRow(row, [row])

    const hsnError = errors.find((e) => e.errorType === 'hsn_code' && e.severity === 'ERROR')
    expect(hsnError).toBeDefined()
    expect(hsnError!.errorMessage).toMatch(/numeric/)
  })

  test('24.11 — Duplicate invoice+supplier within period produces duplicate_invoice ERROR', () => {
    const row1 = makeRow({ id: 'row-1', invoiceNumber: 'SUPP-001', rowNumber: 1 })
    const row2 = makeRow({ id: 'row-2', invoiceNumber: 'SUPP-001', rowNumber: 2 }) // same inv# + GSTIN

    const errors = validatePurchaseRow(row1, [row1, row2])

    const dupError = errors.find((e) => e.errorType === 'duplicate_invoice')
    expect(dupError).toBeDefined()
    expect(dupError!.severity).toBe('ERROR')
  })

  test('24.12 — Zero taxable value produces WARNING (not ERROR)', () => {
    const row = makeRow({ taxableValue: 0 })
    const errors = validatePurchaseRow(row, [row])

    const tvError = errors.find((e) => e.fieldName === 'taxable_value')
    expect(tvError).toBeDefined()
    expect(tvError!.severity).toBe('WARNING')
  })

  test('24.13 — Valid HSN code with 4 digits passes', () => {
    const row = makeRow({ hsnCode: '9983' })
    const errors = validatePurchaseRow(row, [row])

    const hsnErrors = errors.filter((e) => e.errorType === 'hsn_code')
    expect(hsnErrors).toHaveLength(0)
  })

  test('24.14 — Null HSN code is allowed (optional field)', () => {
    const row = makeRow({ hsnCode: null })
    const errors = validatePurchaseRow(row, [row])

    const hsnErrors = errors.filter((e) => e.errorType === 'hsn_code')
    expect(hsnErrors).toHaveLength(0)
  })
})
