/**
 * Test Group 11: JSON Generator
 * Tests: 11.1, 11.8, 11.9 (API-level tests; section classification in service unit tests)
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockClient, mockInvoice, mockFilingStatus } from './helpers/factories'
import { createAdminToken, createConsultantToken } from './helpers/auth'

const adminToken = `Bearer ${createAdminToken()}`
const consultantToken = `Bearer ${createConsultantToken()}`

function setupAdmin() {
  prismaMock.user.findUnique.mockResolvedValue(mockUser({ isActive: true }) as any)
}

function setupConsultant() {
  prismaMock.user.findUnique.mockResolvedValue(
    mockUser({ id: 'user-consultant', role: 'CONSULTANT', isActive: true }) as any
  )
}

// Mock client + validated invoice data setup
function setupValidatedInvoices(invoices: any[] = [mockInvoice()]) {
  // First findFirst: route's tenant check; second findFirst: generator's own check
  prismaMock.client.findFirst
    .mockResolvedValueOnce(mockClient() as any)  // route check
    .mockResolvedValueOnce(mockClient() as any)  // generator check

  prismaMock.invoiceData.count
    .mockResolvedValueOnce(0)   // invalid count = 0 (none invalid)
    .mockResolvedValueOnce(invoices.length) // valid count > 0

  prismaMock.invoiceData.findMany.mockResolvedValue(invoices as any)
  prismaMock.filingStatus.upsert.mockResolvedValue(mockFilingStatus() as any)
  prismaMock.auditLog.create.mockResolvedValue({} as any)
}

describe('POST /api/json-generate', () => {
  test('11.1 — Generate GSTR-1 JSON for validated client returns JSON', async () => {
    setupAdmin()
    setupValidatedInvoices()

    const res = await request(app)
      .post('/api/json-generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('json')
    expect(res.body.data).toHaveProperty('metadata')
    expect(res.body.data).toHaveProperty('fileName')
  })

  test('11.2 — Generated JSON has all 6 required sections', async () => {
    setupAdmin()
    setupValidatedInvoices()

    const res = await request(app)
      .post('/api/json-generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    const { json } = res.body.data
    expect(json).toHaveProperty('b2b')
    expect(json).toHaveProperty('b2cl')
    expect(json).toHaveProperty('b2cs')
    expect(json).toHaveProperty('cdnr')
    expect(json).toHaveProperty('exp')
    expect(json).toHaveProperty('hsn')
  })

  test('11.8 — Generate blocked when there are invalid invoices', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.invoiceData.count.mockResolvedValueOnce(3) // 3 invalid invoices

    const res = await request(app)
      .post('/api/json-generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/validation errors/i)
  })

  test('11.8b — Generate blocked when no validated invoices exist', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.invoiceData.count
      .mockResolvedValueOnce(0)  // no invalid
      .mockResolvedValueOnce(0)  // no valid either

    const res = await request(app)
      .post('/api/json-generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no validated invoices/i)
  })

  test('11.9 — Filing status updated to JSON_GENERATED after generation', async () => {
    setupAdmin()
    setupValidatedInvoices()

    await request(app)
      .post('/api/json-generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(prismaMock.filingStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ gstr1Status: 'JSON_GENERATED', jsonGenerated: true }),
      })
    )
  })

  test('11.1b — Consultant can generate JSON for assigned client', async () => {
    setupConsultant()
    // Route check: consultant+assigned
    prismaMock.client.findFirst
      .mockResolvedValueOnce(mockClient({ assignedTo: 'user-consultant' }) as any)
      .mockResolvedValueOnce(mockClient({ assignedTo: 'user-consultant' }) as any)

    prismaMock.invoiceData.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)

    prismaMock.invoiceData.findMany.mockResolvedValue([mockInvoice()] as any)
    prismaMock.filingStatus.upsert.mockResolvedValue(mockFilingStatus() as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/json-generate')
      .set('Authorization', consultantToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
  })

  test('11.3 — B2B invoice appears in b2b section', async () => {
    setupAdmin()
    const b2bInvoice = mockInvoice({
      buyerGstin: '27AABCU9603R1ZX',
      transactionType: 'B2B',
    })
    setupValidatedInvoices([b2bInvoice])

    const res = await request(app)
      .post('/api/json-generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.json.b2b).toHaveLength(1)
    expect(res.body.data.json.b2b[0].ctin).toBe('27AABCU9603R1ZX')
  })
})
