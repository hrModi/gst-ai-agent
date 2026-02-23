/**
 * Test Group 22: GSTR-2B API
 * Covers: upload, status, report, reconcile, list endpoints.
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockClient, mockGstr2bEntry, mockReconciliationReport } from './helpers/factories'
import { createAdminToken, createConsultantToken } from './helpers/auth'

const adminToken = `Bearer ${createAdminToken()}`
const consultantToken = `Bearer ${createConsultantToken()}`

// ── Module mocks (hoisted) ────────────────────────────────────────────────────
jest.mock('../services/gstr2b/parser', () => ({
  parseGstr2bFile: jest.fn(),
}))

jest.mock('../services/gstr2b/reconciler', () => ({
  runReconciliation: jest.fn(),
}))

import { parseGstr2bFile } from '../services/gstr2b/parser'
import { runReconciliation } from '../services/gstr2b/reconciler'

// ── Helpers ───────────────────────────────────────────────────────────────────
function setupAdmin() {
  prismaMock.user.findUnique.mockResolvedValue(mockUser({ isActive: true }) as any)
}

function setupConsultant() {
  prismaMock.user.findUnique.mockResolvedValue(
    mockUser({ id: 'user-consultant', role: 'CONSULTANT', isActive: true }) as any
  )
}

const MOCK_ENTRIES = [
  { clientId: 'client-001', month: 1, year: 2026, supplierGstin: '27AABCU9603R1ZX', invoiceNumber: 'SUPP-001',
    invoiceDate: '05-01-2026', invoiceValue: 23600, taxableValue: 20000, igstAmount: 0, cgstAmount: 1800,
    sgstAmount: 1800, cessAmount: 0, itcAvailable: 3600, matchStatus: 'PENDING' },
]

// ── Tests: POST /api/gstr2b/upload ───────────────────────────────────────────
describe('POST /api/gstr2b/upload', () => {
  test('22.1 — Missing file returns 400', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)

    const res = await request(app)
      .post('/api/gstr2b/upload')
      .set('Authorization', adminToken)
      .field('clientId', 'client-001')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no file/i)
  })

  test('22.2 — Parse error returns 400 with message', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    ;(parseGstr2bFile as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid GSTR-2B format')
    })

    const res = await request(app)
      .post('/api/gstr2b/upload')
      .set('Authorization', adminToken)
      .attach('file', Buffer.from('{}'), 'gstr2b.json')
      .field('clientId', 'client-001')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid gstr-2b format/i)
  })

  test('22.3 — Successful upload stores entries and returns count', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    ;(parseGstr2bFile as jest.Mock).mockReturnValue(MOCK_ENTRIES)
    prismaMock.gstr2bEntry.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.gstr2bEntry.createMany.mockResolvedValue({ count: 1 })
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/gstr2b/upload')
      .set('Authorization', adminToken)
      .attach('file', Buffer.from('{}'), 'gstr2b.json')
      .field('clientId', 'client-001')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(201)
    expect(res.body.data.uploaded).toBe(1)
    expect(prismaMock.gstr2bEntry.deleteMany).toHaveBeenCalled()
    expect(prismaMock.gstr2bEntry.createMany).toHaveBeenCalled()
  })

  test('22.4 — Consultant cannot upload for unassigned client', async () => {
    setupConsultant()
    prismaMock.client.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/gstr2b/upload')
      .set('Authorization', consultantToken)
      .attach('file', Buffer.from('{}'), 'gstr2b.json')
      .field('clientId', 'client-001')
      .field('month', '1')
      .field('year', '2026')

    expect(res.status).toBe(404)
  })
})

// ── Tests: GET /api/gstr2b/status ────────────────────────────────────────────
describe('GET /api/gstr2b/status', () => {
  test('22.5 — Returns total and ready=false when no entries', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr2bEntry.count.mockResolvedValue(0)

    const res = await request(app)
      .get('/api/gstr2b/status')
      .set('Authorization', adminToken)
      .query({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(0)
    expect(res.body.data.ready).toBe(false)
  })

  test('22.6 — Returns ready=true when entries exist', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr2bEntry.count.mockResolvedValue(5)

    const res = await request(app)
      .get('/api/gstr2b/status')
      .set('Authorization', adminToken)
      .query({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(5)
    expect(res.body.data.ready).toBe(true)
  })
})

// ── Tests: GET /api/gstr2b/report/:clientId ──────────────────────────────────
describe('GET /api/gstr2b/report/:clientId', () => {
  test('22.7 — Returns reconciliation report for client', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.reconciliationReport.findUnique.mockResolvedValue(mockReconciliationReport() as any)

    const res = await request(app)
      .get('/api/gstr2b/report/client-001')
      .set('Authorization', adminToken)
      .query({ month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.matched).toBe(8)
    expect(res.body.data.mismatched).toBe(1)
  })

  test('22.8 — Returns null data when no report yet', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.reconciliationReport.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/gstr2b/report/client-001')
      .set('Authorization', adminToken)
      .query({ month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })
})

// ── Tests: POST /api/gstr2b/reconcile ────────────────────────────────────────
describe('POST /api/gstr2b/reconcile', () => {
  test('22.9 — Blocked when no GSTR-2B data exists', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr2bEntry.count.mockResolvedValue(0)

    const res = await request(app)
      .post('/api/gstr2b/reconcile')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no gstr-2b data/i)
  })

  test('22.10 — Successful reconciliation returns report', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr2bEntry.count.mockResolvedValue(10)
    ;(runReconciliation as jest.Mock).mockResolvedValue(undefined)
    prismaMock.auditLog.create.mockResolvedValue({} as any)
    prismaMock.reconciliationReport.findUnique.mockResolvedValue(mockReconciliationReport() as any)

    const res = await request(app)
      .post('/api/gstr2b/reconcile')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(runReconciliation).toHaveBeenCalledWith('client-001', 1, 2026, 'tenant-abc')
    expect(res.body.data.matched).toBe(8)
  })
})

// ── Tests: GET /api/gstr2b/:clientId ─────────────────────────────────────────
describe('GET /api/gstr2b/:clientId', () => {
  test('22.11 — Returns all entries for client', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr2bEntry.findMany.mockResolvedValue([mockGstr2bEntry()] as any)

    const res = await request(app)
      .get('/api/gstr2b/client-001')
      .set('Authorization', adminToken)
      .query({ month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].matchStatus).toBe('MATCHED')
  })

  test('22.12 — matchStatus filter applied when provided', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr2bEntry.findMany.mockResolvedValue([
      mockGstr2bEntry({ matchStatus: 'MISMATCHED' }),
    ] as any)

    const res = await request(app)
      .get('/api/gstr2b/client-001')
      .set('Authorization', adminToken)
      .query({ month: '1', year: '2026', matchStatus: 'MISMATCHED' })

    expect(res.status).toBe(200)
    const callArgs = prismaMock.gstr2bEntry.findMany.mock.calls[0][0]
    expect(callArgs.where.matchStatus).toBe('MISMATCHED')
  })
})
