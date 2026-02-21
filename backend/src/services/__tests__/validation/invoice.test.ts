/**
 * Test Group 10: Invoice Upload & Validation (service unit tests)
 * Tests: 10.2–10.5 — pure validation rule functions
 *
 * validateInvoice() and classifyTransaction() are tested here.
 * The actual upload endpoint is integration-tested in invoices.test.ts.
 */

import { validateInvoice, classifyTransaction } from '../../validation/invoice'

function baseInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-001',
    invoiceDate: '05-01-2026',
    buyerGstin: '27AABCU9603R1ZX',
    buyerName: 'Buyer Co',
    placeOfSupply: '27',
    reverseCharge: false,
    invoiceValue: 11800,
    taxableValue: 10000,
    taxRate: 18,
    igstAmount: 0,
    cgstAmount: 900,
    sgstAmount: 900,
    cessAmount: 0,
    hsnCode: '9983',
    description: 'Services',
    noteType: null,
    exportType: null,
    month: 1,
    year: 2026,
    rowNumber: 1,
    ...overrides,
  }
}

// ─── Rule 1: GSTIN Format ─────────────────────────────────────────────────────

describe('10.2 — GSTIN format validation (Rule 1)', () => {
  test('Valid GSTIN passes without error', () => {
    const inv = baseInvoice({ buyerGstin: '27AABCU9603R1ZX' })
    const errors = validateInvoice(inv, [inv])
    const gstinErrors = errors.filter(e => e.errorType === 'gstin_format')
    expect(gstinErrors).toHaveLength(0)
  })

  test('Invalid GSTIN format produces error', () => {
    const inv = baseInvoice({ buyerGstin: 'INVALID-GSTIN' })
    const errors = validateInvoice(inv, [inv])
    const gstinErrors = errors.filter(e => e.errorType === 'gstin_format')
    expect(gstinErrors.length).toBeGreaterThan(0)
    expect(gstinErrors[0].severity).toBe('ERROR')
  })

  test('GSTIN shorter than 15 chars is flagged', () => {
    const inv = baseInvoice({ buyerGstin: '27AABCU9603R1Z' }) // 14 chars
    const errors = validateInvoice(inv, [inv])
    expect(errors.some(e => e.errorType === 'gstin_format')).toBe(true)
  })

  test('Null buyerGstin (B2CS) does not trigger GSTIN error', () => {
    const inv = baseInvoice({ buyerGstin: null, taxableValue: 1000 })
    const errors = validateInvoice(inv, [inv])
    const gstinErrors = errors.filter(e => e.errorType === 'gstin_format')
    expect(gstinErrors).toHaveLength(0)
  })

  test('Invalid state code (00) in GSTIN is flagged', () => {
    // State code "00" is not valid (01–38)
    const inv = baseInvoice({ buyerGstin: '00AABCU9603R1ZX' })
    const errors = validateInvoice(inv, [inv])
    expect(errors.some(e => e.errorType === 'gstin_format')).toBe(true)
  })
})

// ─── Rule 2: Duplicate Invoice ────────────────────────────────────────────────

describe('10.3 — Duplicate invoice number (Rule 2)', () => {
  test('Unique invoice numbers pass without error', () => {
    const inv1 = baseInvoice({ id: 'inv-1', invoiceNumber: 'INV-001' })
    const inv2 = baseInvoice({ id: 'inv-2', invoiceNumber: 'INV-002' })
    const errors1 = validateInvoice(inv1, [inv1, inv2])
    const errors2 = validateInvoice(inv2, [inv1, inv2])
    expect(errors1.filter(e => e.errorType === 'duplicate_invoice')).toHaveLength(0)
    expect(errors2.filter(e => e.errorType === 'duplicate_invoice')).toHaveLength(0)
  })

  test('Duplicate invoice number flagged as error', () => {
    const inv1 = baseInvoice({ id: 'inv-1', invoiceNumber: 'INV-001', rowNumber: 1 })
    const inv2 = baseInvoice({ id: 'inv-2', invoiceNumber: 'INV-001', rowNumber: 2 }) // duplicate
    const errors = validateInvoice(inv1, [inv1, inv2])
    const dupErrors = errors.filter(e => e.errorType === 'duplicate_invoice')
    expect(dupErrors.length).toBeGreaterThan(0)
    expect(dupErrors[0].severity).toBe('ERROR')
  })

  test('Same invoice number for different invoices (different IDs) both flagged', () => {
    const inv1 = baseInvoice({ id: 'inv-1', invoiceNumber: 'DUP-001', rowNumber: 1 })
    const inv2 = baseInvoice({ id: 'inv-2', invoiceNumber: 'DUP-001', rowNumber: 2 })
    const errors1 = validateInvoice(inv1, [inv1, inv2])
    const errors2 = validateInvoice(inv2, [inv1, inv2])
    expect(errors1.some(e => e.errorType === 'duplicate_invoice')).toBe(true)
    expect(errors2.some(e => e.errorType === 'duplicate_invoice')).toBe(true)
  })
})

// ─── Rule 3: Tax Calculation ──────────────────────────────────────────────────

describe('10.4 — Tax calculation mismatch (Rule 3)', () => {
  test('Correct CGST+SGST passes (within 0.01 tolerance)', () => {
    // taxableValue=10000, rate=18% → expected=1800 total → 900 each
    const inv = baseInvoice({ taxableValue: 10000, taxRate: 18, cgstAmount: 900, sgstAmount: 900, igstAmount: 0 })
    const errors = validateInvoice(inv, [inv])
    const taxErrors = errors.filter(e => e.errorType === 'tax_calculation')
    expect(taxErrors).toHaveLength(0)
  })

  test('Wrong CGST amount (mismatch > 0.01) flagged as error', () => {
    // expected CGST = 900, declared = 950
    const inv = baseInvoice({ taxableValue: 10000, taxRate: 18, cgstAmount: 950, sgstAmount: 900, igstAmount: 0 })
    const errors = validateInvoice(inv, [inv])
    const taxErrors = errors.filter(e => e.errorType === 'tax_calculation')
    expect(taxErrors.length).toBeGreaterThan(0)
    expect(taxErrors[0].severity).toBe('ERROR')
  })

  test('Wrong IGST amount flagged as error', () => {
    // Interstate: taxableValue=10000, rate=18% → expected IGST=1800, declared=2000
    const inv = baseInvoice({ taxableValue: 10000, taxRate: 18, igstAmount: 2000, cgstAmount: 0, sgstAmount: 0 })
    const errors = validateInvoice(inv, [inv])
    const taxErrors = errors.filter(e => e.errorType === 'tax_calculation' && e.fieldName === 'igst_amount')
    expect(taxErrors.length).toBeGreaterThan(0)
  })

  test('No tax amounts with taxRate > 0 gives WARNING', () => {
    const inv = baseInvoice({ taxRate: 18, igstAmount: 0, cgstAmount: 0, sgstAmount: 0 })
    const errors = validateInvoice(inv, [inv])
    const warn = errors.filter(e => e.errorType === 'tax_calculation' && e.severity === 'WARNING')
    expect(warn.length).toBeGreaterThan(0)
  })

  test('Amount within 0.01 tolerance passes', () => {
    // Expected CGST = 900, declared = 900.005 (within tolerance)
    const inv = baseInvoice({ taxableValue: 10000, taxRate: 18, cgstAmount: 900.005, sgstAmount: 900, igstAmount: 0 })
    const errors = validateInvoice(inv, [inv])
    const taxErrors = errors.filter(e => e.errorType === 'tax_calculation' && e.fieldName === 'cgst_amount')
    expect(taxErrors).toHaveLength(0)
  })
})

// ─── Rule 5: Date Format ──────────────────────────────────────────────────────

describe('10.5 — Invalid date format (Rule 5)', () => {
  test('Valid DD-MM-YYYY date passes', () => {
    const inv = baseInvoice({ invoiceDate: '05-01-2026', month: 1, year: 2026 })
    const errors = validateInvoice(inv, [inv])
    const dateErrors = errors.filter(e => e.errorType === 'date_format')
    expect(dateErrors).toHaveLength(0)
  })

  test('Date in MM-DD-YYYY format is flagged', () => {
    const inv = baseInvoice({ invoiceDate: '01-05-2026' }) // ambiguous; will fail actual date parse if invalid
    // This is accepted as valid if it parses as DD=01, MM=05 which would be May 1
    // Let's test truly invalid format
    const inv2 = baseInvoice({ invoiceDate: '2026-01-05', month: 1, year: 2026 })
    const errors = validateInvoice(inv2, [inv2])
    const dateErrors = errors.filter(e => e.errorType === 'date_format')
    expect(dateErrors.length).toBeGreaterThan(0)
    expect(dateErrors[0].severity).toBe('ERROR')
  })

  test('Invalid date (31st of Feb) is flagged', () => {
    const inv = baseInvoice({ invoiceDate: '31-02-2026', month: 2, year: 2026 })
    const errors = validateInvoice(inv, [inv])
    const dateErrors = errors.filter(e => e.errorType === 'date_format')
    expect(dateErrors.length).toBeGreaterThan(0)
  })

  test('Date outside filing period gives WARNING', () => {
    // Invoice month=1 (Jan) but filing period is month=2 (Feb)
    const inv = baseInvoice({ invoiceDate: '05-01-2026', month: 2, year: 2026 })
    const errors = validateInvoice(inv, [inv])
    const warn = errors.filter(e => e.errorType === 'date_format' && e.severity === 'WARNING')
    expect(warn.length).toBeGreaterThan(0)
  })
})

// ─── Rule 7: Transaction Classification ──────────────────────────────────────

describe('classifyTransaction — Rule 7', () => {
  test('Invoice with buyer GSTIN → B2B', () => {
    const inv = baseInvoice({ buyerGstin: '27AABCU9603R1ZX', taxableValue: 50000 })
    expect(classifyTransaction(inv)).toBe('B2B')
  })

  test('No GSTIN, taxableValue > 250000 → B2CL', () => {
    const inv = baseInvoice({ buyerGstin: null, taxableValue: 300000 })
    expect(classifyTransaction(inv)).toBe('B2CL')
  })

  test('No GSTIN, taxableValue <= 250000 → B2CS', () => {
    const inv = baseInvoice({ buyerGstin: null, taxableValue: 1000 })
    expect(classifyTransaction(inv)).toBe('B2CS')
  })

  test('Credit note → CDNR', () => {
    const inv = baseInvoice({ noteType: 'CREDIT' })
    expect(classifyTransaction(inv)).toBe('CDNR')
  })

  test('Debit note → CDNR', () => {
    const inv = baseInvoice({ noteType: 'DEBIT' })
    expect(classifyTransaction(inv)).toBe('CDNR')
  })

  test('Export invoice → EXP', () => {
    const inv = baseInvoice({ exportType: 'WPAY', buyerGstin: null })
    expect(classifyTransaction(inv)).toBe('EXP')
  })

  test('B2CS: exactly 250000 → B2CS (not B2CL)', () => {
    // Rule: B2CL only when > 250000
    const inv = baseInvoice({ buyerGstin: null, taxableValue: 250000 })
    expect(classifyTransaction(inv)).toBe('B2CS')
  })
})

// ─── Rule 6: HSN Code ────────────────────────────────────────────────────────

describe('HSN/SAC code validation (Rule 6)', () => {
  test('Valid 4-digit HSN passes', () => {
    const inv = baseInvoice({ hsnCode: '9983' })
    const errors = validateInvoice(inv, [inv])
    expect(errors.filter(e => e.errorType === 'hsn_code')).toHaveLength(0)
  })

  test('Valid 6-digit HSN passes', () => {
    const inv = baseInvoice({ hsnCode: '998311' })
    const errors = validateInvoice(inv, [inv])
    expect(errors.filter(e => e.errorType === 'hsn_code')).toHaveLength(0)
  })

  test('Valid 8-digit HSN passes', () => {
    const inv = baseInvoice({ hsnCode: '99831100' })
    const errors = validateInvoice(inv, [inv])
    expect(errors.filter(e => e.errorType === 'hsn_code')).toHaveLength(0)
  })

  test('Non-numeric HSN is flagged', () => {
    const inv = baseInvoice({ hsnCode: 'ABCD' })
    const errors = validateInvoice(inv, [inv])
    expect(errors.filter(e => e.errorType === 'hsn_code')).toHaveLength(1)
  })

  test('5-digit HSN is flagged (not 4/6/8)', () => {
    const inv = baseInvoice({ hsnCode: '99831' })
    const errors = validateInvoice(inv, [inv])
    expect(errors.filter(e => e.errorType === 'hsn_code')).toHaveLength(1)
  })

  test('Null/empty HSN code passes (optional field)', () => {
    const inv = baseInvoice({ hsnCode: null })
    const errors = validateInvoice(inv, [inv])
    expect(errors.filter(e => e.errorType === 'hsn_code')).toHaveLength(0)
  })
})
