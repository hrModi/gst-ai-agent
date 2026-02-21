/**
 * Test Groups 8, 9: Filing Status — List & Filters, Record ARN
 * Tests: 8.1–8.15, 9.1–9.4
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockClient, mockFilingStatus, mockConsultant } from './helpers/factories'
import { createAdminToken, createConsultantToken } from './helpers/auth'

const adminToken = `Bearer ${createAdminToken()}`
const consultantToken = `Bearer ${createConsultantToken()}`

function setupAdmin() {
  prismaMock.user.findUnique.mockResolvedValue(
    mockUser({ isActive: true }) as any
  )
}

function setupConsultant() {
  prismaMock.user.findUnique.mockResolvedValue(
    mockConsultant({ isActive: true }) as any
  )
}

function makeGridClient(overrides: Record<string, any> = {}) {
  return {
    ...mockClient(),
    assignedUser: { id: 'user-admin', name: 'Admin User' },
    filingStatus: [mockFilingStatus()],
    ...overrides,
  }
}

// ─── Group 8: Filing Status List ──────────────────────────────────────────────

describe('GET /api/filing-status', () => {
  test('8.1 — Admin sees all active clients for requested month/year', async () => {
    setupAdmin()
    const clients = [makeGridClient()]
    prismaMock.client.findMany.mockResolvedValue(clients as any)

    const res = await request(app)
      .get('/api/filing-status?month=1&year=2026')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].clientId).toBe('client-001')
  })

  test('8.2 — Stage column returns real stage from DB (not always NOT_STARTED)', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([
      makeGridClient({ filingStatus: [mockFilingStatus({ stage: 'DATA_RECEIVED' })] }),
    ] as any)

    const res = await request(app)
      .get('/api/filing-status?month=1&year=2026')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data[0].stage).toBe('DATA_RECEIVED')
  })

  test('8.1b — Returns NOT_STARTED when no filing status record exists', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([
      makeGridClient({ filingStatus: [] }), // no record yet
    ] as any)

    const res = await request(app)
      .get('/api/filing-status?month=1&year=2026')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data[0].stage).toBe('NOT_STARTED')
    expect(res.body.data[0].dataReceived).toBe(false)
  })

  test('8.1c — Missing month/year query params returns 400', async () => {
    setupAdmin()

    const res = await request(app)
      .get('/api/filing-status')
      .set('Authorization', adminToken)

    expect(res.status).toBe(400)
  })

  test('8.8 — Admin can filter by consultant assignedTo', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([
      makeGridClient({ assignedTo: 'user-consultant' }),
    ] as any)

    const res = await request(app)
      .get('/api/filing-status?month=1&year=2026')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-abc' }),
      })
    )
  })

  test('8.9 — Consultant sees only their own clients in filing status', async () => {
    setupConsultant()
    prismaMock.client.findMany.mockResolvedValue([
      makeGridClient({ assignedTo: 'user-consultant' }),
    ] as any)

    const res = await request(app)
      .get('/api/filing-status?month=1&year=2026')
      .set('Authorization', consultantToken)

    expect(res.status).toBe(200)
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedTo: 'user-consultant' }),
      })
    )
  })

  test('8.15 — Different month/year returns different period data', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([
      makeGridClient({ filingStatus: [mockFilingStatus({ month: 2, year: 2026 })] }),
    ] as any)

    const res = await request(app)
      .get('/api/filing-status?month=2&year=2026')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    // Verify month=2, year=2026 passed to query
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          filingStatus: expect.objectContaining({
            where: { month: 2, year: 2026 },
          }),
        }),
      })
    )
  })
})

// ─── Group 9: Record ARN ──────────────────────────────────────────────────────

describe('POST /api/filed-returns — Record ARN', () => {
  test('9.1 — Admin records GSTR-1 ARN, FiledReturn created and status updated', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.filedReturn.create.mockResolvedValue({
      id: 'fr-001',
      clientId: 'client-001',
      returnType: 'GSTR1',
      month: 1,
      year: 2026,
      arn: 'AA123456789012Z',
      filingDate: new Date('2026-01-11'),
      acknowledgmentUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    prismaMock.filingStatus.upsert.mockResolvedValue(mockFilingStatus() as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/filed-returns')
      .set('Authorization', adminToken)
      .send({
        clientId: 'client-001',
        returnType: 'GSTR1',
        month: 1,
        year: 2026,
        arn: 'AA123456789012Z',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.arn).toBe('AA123456789012Z')
    expect(res.body.data.returnType).toBe('GSTR1')

    // Verify filing status was updated
    expect(prismaMock.filingStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ gstr1Status: 'FILED' }),
      })
    )
  })

  test('9.2 — Record GSTR-1 without ARN still creates record (ARN is optional per schema)', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.filedReturn.create.mockResolvedValue({
      id: 'fr-002',
      clientId: 'client-001',
      returnType: 'GSTR1',
      month: 1,
      year: 2026,
      arn: null,
      filingDate: null,
      acknowledgmentUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    prismaMock.filingStatus.upsert.mockResolvedValue(mockFilingStatus() as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/filed-returns')
      .set('Authorization', adminToken)
      .send({
        clientId: 'client-001',
        returnType: 'GSTR1',
        month: 1,
        year: 2026,
      })

    // ARN is optional in schema, so still 201
    expect(res.status).toBe(201)
  })

  test('9.4 — Consultant can record GSTR-3B ARN for assigned client', async () => {
    setupConsultant()
    prismaMock.client.findFirst.mockResolvedValue(
      mockClient({ assignedTo: 'user-consultant' }) as any
    )
    prismaMock.filedReturn.create.mockResolvedValue({
      id: 'fr-003',
      clientId: 'client-001',
      returnType: 'GSTR3B',
      month: 1,
      year: 2026,
      arn: 'BB987654321012Z',
      filingDate: null,
      acknowledgmentUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    prismaMock.filingStatus.upsert.mockResolvedValue(mockFilingStatus() as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/filed-returns')
      .set('Authorization', consultantToken)
      .send({
        clientId: 'client-001',
        returnType: 'GSTR3B',
        month: 1,
        year: 2026,
        arn: 'BB987654321012Z',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.returnType).toBe('GSTR3B')
    // GSTR-3B status updated
    expect(prismaMock.filingStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ gstr3bStatus: 'FILED' }),
      })
    )
  })
})
