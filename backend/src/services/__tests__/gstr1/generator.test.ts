/**
 * Test Group 11: GSTR-1 JSON Generator — Section Classification (service unit tests)
 * Tests: 11.2–11.7 — GSTR-1 section classification and aggregation logic
 */

import { prismaMock } from '../../../__mocks__/prisma'

// We import the generator AFTER mocking Prisma (jest moduleNameMapper handles this)
import { generateGSTR1 } from '../../gstr1/generator'

function baseMockInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-001',
    clientId: 'client-001',
    month: 1,
    year: 2026,
    invoiceNumber: 'INV-001',
    invoiceDate: '05-01-2026',
    buyerGstin: null,
    buyerName: 'Buyer',
    placeOfSupply: '27',
    reverseCharge: false,
    invoiceValue: 1180,
    taxableValue: 1000,
    taxRate: 18,
    igstAmount: 0,
    cgstAmount: 90,
    sgstAmount: 90,
    cessAmount: 0,
    hsnCode: '9983',
    description: 'Services',
    noteType: null,
    exportType: null,
    validationStatus: 'VALID',
    rowNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function setupClientAndInvoices(invoices: any[]) {
  prismaMock.client.findFirst.mockResolvedValue({
    id: 'client-001',
    tenantId: 'tenant-abc',
    gstin: '27AABCU9603R1ZX',
    stateCode: '27',
  } as any)
  prismaMock.invoiceData.findMany.mockResolvedValue(invoices as any)
}

describe('11.2 — GSTR-1 JSON has all 6 required sections', () => {
  test('generateGSTR1 always includes all 6 sections', async () => {
    setupClientAndInvoices([baseMockInvoice()])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    expect(result.json).toHaveProperty('b2b')
    expect(result.json).toHaveProperty('b2cl')
    expect(result.json).toHaveProperty('b2cs')
    expect(result.json).toHaveProperty('cdnr')
    expect(result.json).toHaveProperty('exp')
    expect(result.json).toHaveProperty('hsn')
    expect(result.json.hsn).toHaveProperty('data')
  })

  test('File name follows {GSTIN}_{MMYYYY}_GSTR1.json convention', async () => {
    setupClientAndInvoices([baseMockInvoice()])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    expect(result.fileName).toBe('27AABCU9603R1ZX_012026_GSTR1.json')
  })
})

describe('11.3 — B2B invoices go to b2b section', () => {
  test('Invoice with buyer GSTIN classified into b2b section', async () => {
    const b2bInvoice = baseMockInvoice({
      id: 'inv-b2b',
      invoiceNumber: 'B2B-001',
      buyerGstin: '29AABCF1234G1Z5',
      taxableValue: 50000,
      cgstAmount: 4500,
      sgstAmount: 4500,
    })
    setupClientAndInvoices([b2bInvoice])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    expect(result.json.b2b).toHaveLength(1)
    expect(result.json.b2b[0].ctin).toBe('29AABCF1234G1Z5')
    expect(result.json.b2b[0].inv).toHaveLength(1)
    expect(result.json.b2cs).toHaveLength(0)
  })

  test('Multiple B2B invoices grouped by buyer GSTIN', async () => {
    const inv1 = baseMockInvoice({ id: 'inv-1', invoiceNumber: 'INV-001', buyerGstin: '27AABCU9603R1ZX' })
    const inv2 = baseMockInvoice({ id: 'inv-2', invoiceNumber: 'INV-002', buyerGstin: '27AABCU9603R1ZX' })
    const inv3 = baseMockInvoice({ id: 'inv-3', invoiceNumber: 'INV-003', buyerGstin: '29AABCF1234G1Z5' })
    setupClientAndInvoices([inv1, inv2, inv3])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    expect(result.json.b2b).toHaveLength(2) // 2 unique buyer GSTINs
    const buyer1Entry = result.json.b2b.find((e: any) => e.ctin === '27AABCU9603R1ZX')
    expect(buyer1Entry?.inv).toHaveLength(2)
  })
})

describe('11.4 — Interstate invoice > ₹2.5L unregistered → b2cl', () => {
  test('Large unregistered invoice goes to b2cl', async () => {
    const b2clInvoice = baseMockInvoice({
      id: 'inv-b2cl',
      invoiceNumber: 'B2CL-001',
      buyerGstin: null,
      taxableValue: 300000,
      invoiceValue: 354000,
      igstAmount: 54000,
      cgstAmount: 0,
      sgstAmount: 0,
    })
    setupClientAndInvoices([b2clInvoice])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    expect(result.json.b2cl).toHaveLength(1)
    expect(result.json.b2cs).toHaveLength(0)
  })
})

describe('11.5 — Small unregistered invoice → b2cs (aggregated)', () => {
  test('Small B2C invoices are aggregated in b2cs', async () => {
    const b2cs1 = baseMockInvoice({
      id: 'inv-1', invoiceNumber: 'S-001', buyerGstin: null, taxableValue: 1000,
      cgstAmount: 90, sgstAmount: 90, placeOfSupply: '27',
    })
    const b2cs2 = baseMockInvoice({
      id: 'inv-2', invoiceNumber: 'S-002', buyerGstin: null, taxableValue: 2000,
      cgstAmount: 180, sgstAmount: 180, placeOfSupply: '27',
    })
    setupClientAndInvoices([b2cs1, b2cs2])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    // Both should be in a single aggregated b2cs entry
    expect(result.json.b2cs).toHaveLength(1)
    expect(result.json.b2cs[0].txval).toBeCloseTo(3000, 1) // aggregated taxable value
  })
})

describe('11.6 — Credit note → cdnr', () => {
  test('Credit note with buyer GSTIN goes to cdnr section', async () => {
    const cdnrInvoice = baseMockInvoice({
      id: 'inv-cdnr', invoiceNumber: 'CN-001',
      noteType: 'CREDIT',
      buyerGstin: '27AABCU9603R1ZX',
      taxableValue: -5000,
    })
    setupClientAndInvoices([cdnrInvoice])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    expect(result.json.cdnr).toHaveLength(1)
    expect(result.json.cdnr[0].nt[0].ntty).toBe('C') // Credit type = 'C'
  })
})

describe('11.7 — Export invoice → exp', () => {
  test('Export invoice goes to exp section', async () => {
    const expInvoice = baseMockInvoice({
      id: 'inv-exp', invoiceNumber: 'EXP-001',
      exportType: 'WPAY',
      buyerGstin: null,
      igstAmount: 1800,
      cgstAmount: 0,
      sgstAmount: 0,
    })
    setupClientAndInvoices([expInvoice])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    expect(result.json.exp).toHaveLength(1)
    expect(result.json.exp[0].exp_typ).toBe('WPAY')
  })
})

describe('11.2b — Metadata is accurate', () => {
  test('Metadata counts invoices and sections correctly', async () => {
    const b2bInv = baseMockInvoice({ id: 'inv-b2b', buyerGstin: '27AABCU9603R1ZX', taxableValue: 10000 })
    const b2csInv = baseMockInvoice({ id: 'inv-b2cs', buyerGstin: null, taxableValue: 1000 })
    setupClientAndInvoices([b2bInv, b2csInv])

    const result = await generateGSTR1('client-001', 1, 2026, 'tenant-abc')

    expect(result.metadata.totalInvoices).toBe(2)
    expect(result.metadata.sections.b2b).toBe(1)
    expect(result.metadata.sections.b2cs).toBe(1)
    expect(result.metadata.sections.b2cl).toBe(0)
  })
})
