/**
 * Test Group 23: GSTR-3B API
 * Covers: generate, download, and summary retrieval endpoints.
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockClient, mockReconciliationReport, mockGstr3bSummary } from './helpers/factories'
import { createAdminToken, createConsultantToken } from './helpers/auth'

const adminToken = `Bearer ${createAdminToken()}`
const consultantToken = `Bearer ${createConsultantToken()}`

// ── Module mocks (hoisted) ────────────────────────────────────────────────────
jest.mock('../services/gstr3b/generator', () => ({
  generateGSTR3B: jest.fn(),
}))

import { generateGSTR3B } from '../services/gstr3b/generator'

const MOCK_GSTR3B_RESULT = {
  json: {
    gstin: '27AABCU9603R1ZX',
    fp: '012026',
    version: 'GST3.2.0',
    hash: 'hash',
    ret_period: '012026',
    sup_details: { osup_det: { txval: 100000, iamt: 0, camt: 9000, samt: 9000, csamt: 0 } },
    itc_elg: { itc_avl: [], itc_net: { iamt: 0, camt: 1800, samt: 1800, csamt: 0 }, itc_inelg: [] },
    inward_sup: { isup_details: [] },
    intr_ltfee: { intr_details: { iamt: 0, camt: 0, samt: 0, csamt: 0 } },
  },
  fileName: '27AABCU9603R1ZX_012026_GSTR3B.json',
  summary: {
    outwardTaxableValue: 100000,
    outwardIgst: 0,
    outwardCgst: 9000,
    outwardSgst: 9000,
    itcIgst: 0,
    itcCgst: 1800,
    itcSgst: 1800,
    netIgst: 0,
    netCgst: 7200,
    netSgst: 7200,
    classification: 'PAYMENT',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setupAdmin() {
  prismaMock.user.findUnique.mockResolvedValue(mockUser({ isActive: true }) as any)
}

function setupConsultant() {
  prismaMock.user.findUnique.mockResolvedValue(
    mockUser({ id: 'user-consultant', role: 'CONSULTANT', isActive: true }) as any
  )
}

// ── Tests: POST /api/gstr3b/generate ─────────────────────────────────────────
describe('POST /api/gstr3b/generate', () => {
  test('23.1 — Missing params returns 400', async () => {
    setupAdmin()

    const res = await request(app)
      .post('/api/gstr3b/generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001' }) // missing month + year

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/)
  })

  test('23.2 — Blocked when reconciliation has not been run', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.reconciliationReport.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/gstr3b/generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reconciliation/i)
  })

  test('23.3 — Successful generation returns JSON + summary', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.reconciliationReport.findUnique.mockResolvedValue(mockReconciliationReport() as any)
    ;(generateGSTR3B as jest.Mock).mockResolvedValue(MOCK_GSTR3B_RESULT)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/gstr3b/generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.json).toHaveProperty('gstin')
    expect(res.body.data.fileName).toMatch(/GSTR3B\.json$/)
    expect(res.body.data.summary.classification).toBe('PAYMENT')
  })

  test('23.4 — generateGSTR3B called with correct params', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.reconciliationReport.findUnique.mockResolvedValue(mockReconciliationReport() as any)
    ;(generateGSTR3B as jest.Mock).mockResolvedValue(MOCK_GSTR3B_RESULT)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    await request(app)
      .post('/api/gstr3b/generate')
      .set('Authorization', adminToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(generateGSTR3B).toHaveBeenCalledWith('client-001', 1, 2026, 'tenant-abc')
  })

  test('23.5 — Consultant can generate for assigned client', async () => {
    setupConsultant()
    prismaMock.client.findFirst.mockResolvedValue(mockClient({ assignedTo: 'user-consultant' }) as any)
    prismaMock.reconciliationReport.findUnique.mockResolvedValue(mockReconciliationReport() as any)
    ;(generateGSTR3B as jest.Mock).mockResolvedValue(MOCK_GSTR3B_RESULT)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/gstr3b/generate')
      .set('Authorization', consultantToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
  })

  test('23.6 — Consultant blocked from unassigned client', async () => {
    setupConsultant()
    prismaMock.client.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/gstr3b/generate')
      .set('Authorization', consultantToken)
      .send({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(404)
  })
})

// ── Tests: GET /api/gstr3b/download ──────────────────────────────────────────
describe('GET /api/gstr3b/download', () => {
  test('23.7 — Returns 404 when GSTR-3B not yet generated', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr3bSummary.findUnique.mockResolvedValue(
      mockGstr3bSummary({ jsonGenerated: false }) as any
    )

    const res = await request(app)
      .get('/api/gstr3b/download')
      .set('Authorization', adminToken)
      .query({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not generated yet/i)
  })

  test('23.8 — Returns 404 when summary does not exist', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr3bSummary.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/gstr3b/download')
      .set('Authorization', adminToken)
      .query({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(404)
  })

  test('23.9 — Returns JSON attachment when generated', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr3bSummary.findUnique.mockResolvedValue(mockGstr3bSummary() as any)
    ;(generateGSTR3B as jest.Mock).mockResolvedValue(MOCK_GSTR3B_RESULT)

    const res = await request(app)
      .get('/api/gstr3b/download')
      .set('Authorization', adminToken)
      .query({ clientId: 'client-001', month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*GSTR3B\.json/)
    const body = JSON.parse(res.text)
    expect(body).toHaveProperty('gstin')
  })
})

// ── Tests: GET /api/gstr3b/:clientId ─────────────────────────────────────────
describe('GET /api/gstr3b/:clientId', () => {
  test('23.10 — Returns summary for client', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr3bSummary.findUnique.mockResolvedValue(mockGstr3bSummary() as any)

    const res = await request(app)
      .get('/api/gstr3b/client-001')
      .set('Authorization', adminToken)
      .query({ month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data.classification).toBe('PAYMENT')
    expect(res.body.data.jsonGenerated).toBe(true)
  })

  test('23.11 — Returns null data when no summary exists', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.gstr3bSummary.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/gstr3b/client-001')
      .set('Authorization', adminToken)
      .query({ month: '1', year: '2026' })

    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })
})
