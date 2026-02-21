/**
 * Test Group 17: Users & Settings
 * Tests: 17.1–17.6
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockConsultant } from './helpers/factories'
import { createAdminToken, createConsultantToken } from './helpers/auth'

const adminToken = `Bearer ${createAdminToken()}`
const consultantToken = `Bearer ${createConsultantToken()}`

function setupAdmin() {
  prismaMock.user.findUnique.mockResolvedValue(mockUser({ isActive: true }) as any)
}

function setupConsultant() {
  prismaMock.user.findUnique.mockResolvedValue(mockConsultant({ isActive: true }) as any)
}

describe('GET /api/users', () => {
  test('17.1 — Admin can view user list', async () => {
    setupAdmin()
    prismaMock.user.findMany.mockResolvedValue([
      { ...mockUser(), _count: { assignedClients: 5 } },
      { ...mockConsultant(), _count: { assignedClients: 10 } },
    ] as any)

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })

  test('17.2 — Consultant cannot access /api/users (403)', async () => {
    setupConsultant()

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', consultantToken)

    expect(res.status).toBe(403)
  })
})

describe('POST /api/users — Create User', () => {
  test('17.3 — Admin can add a new consultant user', async () => {
    setupAdmin()
    prismaMock.user.findFirst.mockResolvedValue(null) // no duplicate email
    prismaMock.user.create.mockResolvedValue(
      mockConsultant({ id: 'user-new', email: 'new@test.com', name: 'New Consultant' }) as any
    )
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken)
      .send({
        name: 'New Consultant',
        email: 'new@test.com',
        role: 'CONSULTANT',
        password: 'StrongPass@1',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.email).toBe('new@test.com')
  })

  test('17.4 — Duplicate email in same tenant returns 409', async () => {
    setupAdmin()
    prismaMock.user.findFirst.mockResolvedValue(mockUser() as any) // duplicate found

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken)
      .send({
        name: 'Dupe User',
        email: 'admin@test.com',
        role: 'CONSULTANT',
        password: 'StrongPass@1',
      })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/i)
  })

  test('17.5 — Weak password (missing special char) returns 400', async () => {
    setupAdmin()

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken)
      .send({
        name: 'Weak Pass User',
        email: 'weak@test.com',
        role: 'CONSULTANT',
        password: 'weakpassword1A', // missing special character
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/password/i)
  })

  test('17.5b — Short password returns 400', async () => {
    setupAdmin()

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken)
      .send({
        name: 'Short Pass',
        email: 'short@test.com',
        role: 'CONSULTANT',
        password: 'Ab1!',
      })

    expect(res.status).toBe(400)
  })
})

describe('PUT /api/users/:id — Edit User', () => {
  test('17.6 — Admin can edit user name/phone/role', async () => {
    setupAdmin()
    prismaMock.user.findFirst.mockResolvedValue(mockConsultant({ id: 'user-consultant' }) as any)
    prismaMock.user.update.mockResolvedValue(
      mockConsultant({ id: 'user-consultant', name: 'Updated Name', phone: '+919999999999' }) as any
    )
    prismaMock.auditLog.create.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/users/user-consultant')
      .set('Authorization', adminToken)
      .send({ name: 'Updated Name', phone: '+919999999999' })

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Updated Name')
  })

  test('17.6b — Editing non-existent user returns 404', async () => {
    setupAdmin()
    prismaMock.user.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/users/nonexistent')
      .set('Authorization', adminToken)
      .send({ name: 'Ghost' })

    expect(res.status).toBe(404)
  })
})
