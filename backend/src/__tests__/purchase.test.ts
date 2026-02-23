/**
 * Test Group 21: Purchase Data API
 * Covers: sample-template, upload, status polling, validate, list endpoints.
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockClient, mockPurchaseData } from './helpers/factories'
import { createAdminToken, createConsultantToken } from './helpers/auth'

const adminToken = `Bearer ${createAdminToken()}`
const consultantToken = `Bearer ${createConsultantToken()}`

// ── Module mocks (hoisted) ────────────────────────────────────────────────────
jest.mock('../services/purchase/parser', () => ({
  parsePurchaseFile: jest.fn(),
}))

jest.mock('../services/purchase/validation-runner', () => ({
  runPurchaseValidation: jest.fn(),
}))

jest.mock('../services/pipeline', () => ({
  processPurchaseData: jest.fn().mockResolvedValue({ valid: 2, invalid: 0, total: 2, stage: 'PURCHASE_VALIDATED' }),
  processClientData: jest.fn().mockResolvedValue({ valid: 2, invalid: 0, total: 2, stage: 'READY_TO_FILE' }),
}))

import { parsePurchaseFile } from '../services/purchase/parser'
import { runPurchaseValidation } from '../services/purchase/validation-runner'

// ── Helpers ───────────────────────────────────────────────────────────────────
function setupAdmin() {
  prismaMock.user.findUnique.mockResolvedValue(mockUser({ isActive: true }) as any)
}

function setupConsultant() {
  prismaMock.user.findUnique.mockResolvedValue(
    mockUser({ id: 'user-consultant', role: 'CONSULTANT', isActive: true }) as any
  )
}

const MOCK_PURCHASE_ROWS = [
  { clientId: 'client-001', month: 1, year: 2026, invoiceNumber: 'SUPP-001', supplierGstin: '27AABCU9603R1ZX' },
  { clientId: 'client-001', month: 1, year: 2026, invoiceNumber: 'SUPP-002', supplierGstin: '27AABCU9603R1ZX' },
]

// ── Tests: GET /api/purchase/sample-template ─────────────────────────────────
describe('GET /api/purchase/sample-template', () => {
  test('21.1 — Returns xlsx attachment without authentication', async () => {
    const res = await request(app).get('/api/purchase/sample-template')

    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/attachment.*purchase-data-sample\.xlsx/)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)
  })
})

// ── Tests: POST /api/purchase/upload ─────────────────────────────────────────
describe('POST /api/purchase/upload', () => {
  test('21.2 — Missing file returns 400', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)

    const res = await request(app)
      .post('/api/purchase/upload')
      .set('Authorization', adminToken)
      .field('clientId', 'client-001')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no file/i)
  })

  test('21.3 — Missing required body params returns 400', async () => {
    setupAdmin()

    const res = await request(app)
      .post('/api/purchase/upload')
      .set('Authorization', adminToken)
      .attach('file', Buffer.from('test'), 'test.xlsx')
      // missing clientId/month/year

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/)
  })

  test('21.4 — Client not found returns 404', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/purchase/upload')
      .set('Authorization', adminToken)
      .attach('file', Buffer.from('test'), 'test.xlsx')
      .field('clientId', 'nonexistent')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })

  test('21.5 — Successful upload returns 201 with row count', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    ;(parsePurchaseFile as jest.Mock).mockReturnValue(MOCK_PURCHASE_ROWS)

    const res = await request(app)
      .post('/api/purchase/upload')
      .set('Authorization', adminToken)
      .attach('file', Buffer.from('test'), 'test.xlsx')
      .field('clientId', 'client-001')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(201)
    expect(res.body.data.uploaded).toBe(2)
  })

  test('21.6 — Parse error returns 400 with error message', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    ;(parsePurchaseFile as jest.Mock).mockImplementation(() => {
      throw new Error('File contains no data rows')
    })

    const res = await request(app)
      .post('/api/purchase/upload')
      .set('Authorization', adminToken)
      .attach('file', Buffer.from('test'), 'test.xlsx')
      .field('clientId', 'client-001')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no data rows/i)
  })

  test('21.7 — Consultant blocked from unassigned client', async () => {
    setupConsultant()
    prismaMock.client.findFirst.mockResolvedValue(null) // RBAC: not assigned → null

    const res = await request(app)
      .post('/api/purchase/upload')
      .set('Authorization', consultantToken)
      .attach('file', Buffer.from('test'), 'test.xlsx')
      .field('clientId', 'client-001')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(404)
  })
})

// ── Tests: GET /api/purchase/status ──────────────────────────────────────────
describe('GET /api/purchase/status', () => {
  test('21.8 — Missing params returns 400', async () => {
    setupAdmin()

    const res = await request(app)
      .get('/api/purchase/status')
      .set('Authorization', adminToken)
      .query({ clientId: 'client-001' }) // missing month + year

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/)
  })

  test('21.9 — Client not found returns 404', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/purchase/status')
      .set('Authorization', adminToken)
      .query({ clientId: 'nonexistent', month: '1', year: '2026' })

    expect(res.status).toBe(404)
  })

  test('21.10 — Returns validation count breakdown', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    ;(prismaMock.purchaseData.groupBy as any).mockResolvedValue([
      { validationStatus: 'VALID', _count: 5 },
      { validationStatus: 'INVALID', _count: 2 },
    ])

    const res = await request(app)
      .get('/api/purchase/status')
      .set('Authorization', adminToken)
      .query({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.valid).toBe(5)
    expect(res.body.data.invalid).toBe(2)
    expect(res.body.data.total).toBe(7)
    expect(res.body.data.validating).toBe(false)
  })

  test('21.11 — Returns validating=true when PENDING rows exist', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    ;(prismaMock.purchaseData.groupBy as any).mockResolvedValue([
      { validationStatus: 'PENDING', _count: 3 },
    ])

    const res = await request(app)
      .get('/api/purchase/status')
      .set('Authorization', adminToken)
      .query({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.validating).toBe(true)
    expect(res.body.data.pending).toBe(3)
  })
})

// ── Tests: POST /api/purchase/validate ───────────────────────────────────────
describe('POST /api/purchase/validate', () => {
  test('21.12 — No purchase data for period returns 404', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.purchaseData.count.mockResolvedValue(0)

    const res = await request(app)
      .post('/api/purchase/validate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/no purchase data/i)
  })

  test('21.13 — Successful validation returns summary', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.purchaseData.count.mockResolvedValue(5)
    ;(runPurchaseValidation as jest.Mock).mockResolvedValue({
      valid: 4, invalid: 1, totalErrors: 2, total: 5,
    })

    const res = await request(app)
      .post('/api/purchase/validate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.valid).toBe(4)
    expect(res.body.data.invalid).toBe(1)
    expect(res.body.data.total).toBe(5)
  })
})

// ── Tests: GET /api/purchase/:clientId ───────────────────────────────────────
describe('GET /api/purchase/:clientId', () => {
  test('21.14 — Returns purchase data rows for client', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.purchaseData.findMany.mockResolvedValue([
      { ...mockPurchaseData(), validationErrors: [] },
    ] as any)

    const res = await request(app)
      .get('/api/purchase/client-001')
      .set('Authorization', adminToken)
      .query({ month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].invoiceNumber).toBe('SUPP-001')
  })

  test('21.15 — Consultant cannot access unassigned client data', async () => {
    setupConsultant()
    prismaMock.client.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/purchase/client-001')
      .set('Authorization', consultantToken)

    expect(res.status).toBe(404)
  })
})
