/**
 * Test Group 3: Multi-Tenancy Isolation
 * Tests: 3.1–3.6
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockClient, mockFilingStatus } from './helpers/factories'
import { createTokenForTenant } from './helpers/auth'

function authHeader(tenantId: string, userId = 'user-a', role = 'ADMIN') {
  return `Bearer ${createTokenForTenant(tenantId, userId, role)}`
}

// For the authenticate middleware to pass, user.findUnique must return an active user
function setupAuthForTenant(tenantId: string, userId = 'user-a') {
  prismaMock.user.findUnique.mockResolvedValue(
    mockUser({ id: userId, tenantId, isActive: true }) as any
  )
}

describe('Multi-Tenancy Isolation', () => {
  test('3.1 — Firm A user GET /api/clients only sees Firm A clients', async () => {
    setupAuthForTenant('tenant-a', 'user-a')

    const firmAClients = [
      mockClient({ id: 'c-a1', tenantId: 'tenant-a', legalName: 'Firm A Client' }),
    ]
    prismaMock.client.findMany.mockResolvedValue(firmAClients as any)
    prismaMock.client.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', authHeader('tenant-a', 'user-a'))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].legalName).toBe('Firm A Client')

    // Verify the query scoped to tenant-a
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
      })
    )
  })

  test('3.2 — Firm A user GET /api/clients/:id for Firm B client returns 404', async () => {
    setupAuthForTenant('tenant-a', 'user-a')
    // findFirst returns null because tenantId doesn't match
    prismaMock.client.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/clients/client-b1')
      .set('Authorization', authHeader('tenant-a', 'user-a'))

    expect(res.status).toBe(404)
  })

  test('3.3 — Firm A user PUT /api/clients/:id for Firm B client returns 404', async () => {
    setupAuthForTenant('tenant-a', 'user-a')
    prismaMock.client.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/clients/client-b1')
      .set('Authorization', authHeader('tenant-a', 'user-a'))
      .send({
        gstin: '27AABCU9603R1ZX',
        legalName: 'Hacked Client',
        filingFrequency: 'MONTHLY',
      })

    expect(res.status).toBe(404)
  })

  test('3.4 — Same GSTIN in two different tenants is allowed', async () => {
    // Firm A creates client with GSTIN X
    setupAuthForTenant('tenant-a', 'user-a')
    prismaMock.client.findFirst.mockResolvedValue(null) // no conflict in tenant-a
    prismaMock.client.create.mockResolvedValue(
      mockClient({ tenantId: 'tenant-a', gstin: '27AABCU9603R1ZX' }) as any
    )
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const resA = await request(app)
      .post('/api/clients')
      .set('Authorization', authHeader('tenant-a', 'user-a'))
      .send({ gstin: '27AABCU9603R1ZX', legalName: 'Firm A Corp', filingFrequency: 'MONTHLY' })

    expect(resA.status).toBe(201)

    // Firm B also creates client with SAME GSTIN — should be fine
    setupAuthForTenant('tenant-b', 'user-b')
    prismaMock.client.findFirst.mockResolvedValue(null) // no conflict in tenant-b
    prismaMock.client.create.mockResolvedValue(
      mockClient({ tenantId: 'tenant-b', gstin: '27AABCU9603R1ZX' }) as any
    )
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const resB = await request(app)
      .post('/api/clients')
      .set('Authorization', authHeader('tenant-b', 'user-b'))
      .send({ gstin: '27AABCU9603R1ZX', legalName: 'Firm B Corp', filingFrequency: 'MONTHLY' })

    expect(resB.status).toBe(201)
  })

  test('3.6 — Filing status from Firm A not visible to Firm B', async () => {
    // Firm B queries filing status — gets only Firm B clients (mocked as empty)
    setupAuthForTenant('tenant-b', 'user-b')
    prismaMock.client.findMany.mockResolvedValue([]) // Firm B has no clients yet

    const res = await request(app)
      .get('/api/filing-status?month=1&year=2026')
      .set('Authorization', authHeader('tenant-b', 'user-b'))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)

    // The query must be scoped to tenant-b
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-b' }),
      })
    )
  })
})
