/**
 * Test Groups 4, 5, 6: Clients — List/Filters, CRUD, Bulk Actions
 * Tests: 4.1–4.9, 5.1–5.12, 6.1–6.7
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockClient, mockConsultant, mockAuditLog } from './helpers/factories'
import { createAdminToken, createConsultantToken } from './helpers/auth'

const adminToken = `Bearer ${createAdminToken()}`
const consultantToken = `Bearer ${createConsultantToken()}`

function setupAdmin(tenantId = 'tenant-abc') {
  prismaMock.user.findUnique.mockResolvedValue(
    mockUser({ id: 'user-admin', tenantId, isActive: true }) as any
  )
}

function setupConsultant(tenantId = 'tenant-abc') {
  prismaMock.user.findUnique.mockResolvedValue(
    mockConsultant({ id: 'user-consultant', tenantId, isActive: true }) as any
  )
}

// ─── Group 4: List & Filters ─────────────────────────────────────────────────

describe('GET /api/clients — List & Filters', () => {
  test('4.1 — Admin sees all active clients by default', async () => {
    setupAdmin()
    const clients = [mockClient(), mockClient({ id: 'client-002', legalName: 'Second Co' })]
    prismaMock.client.findMany.mockResolvedValue(clients as any)
    prismaMock.client.count.mockResolvedValue(2)

    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.pagination.total).toBe(2)
  })

  test('4.2 — Search by legal name filters results', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([mockClient()] as any)
    prismaMock.client.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/clients?search=Test%20Company')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    // Verify the search was included in the query
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ legalName: expect.objectContaining({ contains: 'Test Company' }) }),
          ]),
        }),
      })
    )
  })

  test('4.3 — Search by GSTIN filters results', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([mockClient()] as any)
    prismaMock.client.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/clients?search=27AABCU')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ gstin: expect.objectContaining({ contains: '27AABCU' }) }),
          ]),
        }),
      })
    )
  })

  test('4.5 — Filter by consultant ID shows only that consultant\'s clients', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([
      mockClient({ assignedTo: 'user-consultant' }),
    ] as any)
    prismaMock.client.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/clients?assignedTo=user-consultant')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedTo: 'user-consultant' }),
      })
    )
  })

  test('4.6 — Filter by "unassigned" shows clients with no consultant', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([mockClient({ assignedTo: null })] as any)
    prismaMock.client.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/clients?assignedTo=unassigned')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedTo: null }),
      })
    )
  })

  test('4.7 — Consultant sees only own assigned clients', async () => {
    setupConsultant()
    prismaMock.client.findMany.mockResolvedValue([
      mockClient({ assignedTo: 'user-consultant' }),
    ] as any)
    prismaMock.client.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', consultantToken)

    expect(res.status).toBe(200)
    // Consultant filter applied automatically
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedTo: 'user-consultant' }),
      })
    )
  })

  test('4.9 — Pagination returns correct page/limit', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([mockClient()] as any)
    prismaMock.client.count.mockResolvedValue(30)

    const res = await request(app)
      .get('/api/clients?page=2&limit=15')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.pagination.page).toBe(2)
    expect(res.body.pagination.limit).toBe(15)
    expect(res.body.pagination.total).toBe(30)
    expect(res.body.pagination.totalPages).toBe(2)
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 15, take: 15 })
    )
  })
})

// ─── Group 5: CRUD ───────────────────────────────────────────────────────────

describe('POST /api/clients — Create', () => {
  test('5.1 — Admin creates client with valid GSTIN', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(null) // no duplicate
    prismaMock.client.create.mockResolvedValue(mockClient() as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', adminToken)
      .send({
        gstin: '27AABCU9603R1ZX',
        legalName: 'Test Company Pvt Ltd',
        filingFrequency: 'MONTHLY',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.gstin).toBe('27AABCU9603R1ZX')
  })

  test('5.3 — Duplicate GSTIN within same tenant returns 409', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any) // duplicate found

    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', adminToken)
      .send({
        gstin: '27AABCU9603R1ZX',
        legalName: 'Another Company',
        filingFrequency: 'MONTHLY',
      })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/i)
  })

  test('5.2 — Missing GSTIN returns 400 validation error', async () => {
    setupAdmin()

    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', adminToken)
      .send({ legalName: 'No GSTIN Corp', filingFrequency: 'MONTHLY' })

    expect(res.status).toBe(400)
  })

  test('5.4 — Consultant cannot create clients (POST /api/clients returns 403)', async () => {
    setupConsultant()

    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', consultantToken)
      .send({ gstin: '27AABCU9603R1ZX', legalName: 'Test', filingFrequency: 'MONTHLY' })

    expect(res.status).toBe(403)
  })
})

describe('GET /api/clients/:id — Detail', () => {
  test('5.6 — Admin/Consultant can view client detail', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)

    const res = await request(app)
      .get('/api/clients/client-001')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('client-001')
  })

  test('5.6b — Consultant can view their assigned client', async () => {
    setupConsultant()
    prismaMock.client.findFirst.mockResolvedValue(
      mockClient({ assignedTo: 'user-consultant' }) as any
    )

    const res = await request(app)
      .get('/api/clients/client-001')
      .set('Authorization', consultantToken)

    expect(res.status).toBe(200)
  })
})

describe('PUT /api/clients/:id — Edit', () => {
  test('5.5 — Admin can edit client details', async () => {
    setupAdmin()
    const existing = mockClient()
    prismaMock.client.findFirst.mockResolvedValue(existing as any)
    prismaMock.client.update.mockResolvedValue(
      mockClient({ legalName: 'Updated Name' }) as any
    )
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/clients/client-001')
      .set('Authorization', adminToken)
      .send({
        gstin: '27AABCU9603R1ZX',
        legalName: 'Updated Name',
        filingFrequency: 'MONTHLY',
      })

    expect(res.status).toBe(200)
    expect(res.body.data.legalName).toBe('Updated Name')
  })
})

describe('DELETE /api/clients/:id — Archive', () => {
  test('5.9 — Admin can archive (soft-delete) a client', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(mockClient() as any)
    prismaMock.client.update.mockResolvedValue(
      mockClient({ status: 'INACTIVE' }) as any
    )
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .delete('/api/clients/client-001')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data.message).toMatch(/deactivated/i)
  })

  test('5.12 — Consultant cannot archive clients (403)', async () => {
    setupConsultant()

    const res = await request(app)
      .delete('/api/clients/client-001')
      .set('Authorization', consultantToken)

    expect(res.status).toBe(403)
  })
})

// ─── Group 6: Bulk Actions ───────────────────────────────────────────────────

describe('PUT /api/clients/bulk-assign — Bulk Assign', () => {
  test('6.2 — Admin can bulk-assign clients to a consultant', async () => {
    setupAdmin()
    prismaMock.user.findFirst.mockResolvedValue(mockConsultant() as any)
    prismaMock.client.updateMany.mockResolvedValue({ count: 2 } as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/clients/bulk-assign')
      .set('Authorization', adminToken)
      .send({ clientIds: ['client-001', 'client-002'], consultantId: 'user-consultant' })

    expect(res.status).toBe(200)
    expect(res.body.data.updated).toBe(2)
  })

  test('6.3 — Bulk assign with null consultantId clears assignment', async () => {
    setupAdmin()
    prismaMock.client.updateMany.mockResolvedValue({ count: 2 } as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/clients/bulk-assign')
      .set('Authorization', adminToken)
      .send({ clientIds: ['client-001', 'client-002'] }) // no consultantId = unassign

    expect(res.status).toBe(200)
    expect(prismaMock.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assignedTo: null } })
    )
  })

  test('6.7 — Consultant cannot bulk-assign (403)', async () => {
    setupConsultant()

    const res = await request(app)
      .put('/api/clients/bulk-assign')
      .set('Authorization', consultantToken)
      .send({ clientIds: ['client-001'], consultantId: 'user-consultant' })

    expect(res.status).toBe(403)
  })
})

describe('PUT /api/clients/bulk-automation — Bulk Edit Reminders', () => {
  test('6.4 — Admin can disable automation for selected clients', async () => {
    setupAdmin()
    prismaMock.client.updateMany.mockResolvedValue({ count: 3 } as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/clients/bulk-automation')
      .set('Authorization', adminToken)
      .send({ clientIds: ['c1', 'c2', 'c3'], automationEnabled: false })

    expect(res.status).toBe(200)
    expect(res.body.data.updated).toBe(3)
    expect(prismaMock.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ automationEnabled: false }) })
    )
  })

  test('6.5 — Bulk edit to email-only (notifyWhatsapp = false)', async () => {
    setupAdmin()
    prismaMock.client.updateMany.mockResolvedValue({ count: 2 } as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/clients/bulk-automation')
      .set('Authorization', adminToken)
      .send({
        clientIds: ['c1', 'c2'],
        automationEnabled: true,
        notifyEmail: true,
        notifyWhatsapp: false,
      })

    expect(res.status).toBe(200)
    expect(prismaMock.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notifyWhatsapp: false }),
      })
    )
  })

  test('6.6 — Bulk edit reminder days', async () => {
    setupAdmin()
    prismaMock.client.updateMany.mockResolvedValue({ count: 2 } as any)
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/clients/bulk-automation')
      .set('Authorization', adminToken)
      .send({
        clientIds: ['c1', 'c2'],
        automationEnabled: true,
        reminderDaysBefore: [5, 2],
      })

    expect(res.status).toBe(200)
    expect(prismaMock.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderDaysBefore: [5, 2] }),
      })
    )
  })
})
