/**
 * Test Group 1: Authentication
 * Tests: 1.1–1.7 (login, me, logout, invalid credentials, inactive user)
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { mockUser, mockTenant } from './helpers/factories'
import { createAdminToken, createExpiredToken } from './helpers/auth'
import { hashPassword } from '../lib/auth'

let validPasswordHash: string

beforeAll(async () => {
  validPasswordHash = await hashPassword('Password@123')
}, 30000)

beforeEach(() => {
  // Reset all mocks between tests (clearMocks in jest.config handles this)
})

describe('POST /api/auth/login', () => {
  test('1.1 — Login with valid email + password returns JWT and user', async () => {
    const user = mockUser({ passwordHash: validPasswordHash })
    prismaMock.user.findFirst.mockResolvedValue({
      ...user,
      tenant: mockTenant(),
    } as any)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Password@123' })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('token')
    expect(res.body.data).toHaveProperty('user')
    expect(res.body.data.user.email).toBe('admin@test.com')
    expect(res.body.data.user.role).toBe('ADMIN')
    expect(res.body.data.user).not.toHaveProperty('passwordHash')
  })

  test('1.2 — Login with wrong password returns 401', async () => {
    const user = mockUser({ passwordHash: validPasswordHash })
    prismaMock.user.findFirst.mockResolvedValue({
      ...user,
      tenant: mockTenant(),
    } as any)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'WrongPassword!' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid email or password')
  })

  test('1.3 — Login with non-existent email returns 401', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@test.com', password: 'Password@123' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid email or password')
  })

  test('1.4 — Login with inactive user account returns 401', async () => {
    // isActive: false → findFirst with isActive: true filter returns null
    prismaMock.user.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@test.com', password: 'Password@123' })

    expect(res.status).toBe(401)
  })

  test('1.2b — Login with missing email returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Password@123' })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/me', () => {
  test('1.7 — GET /api/auth/me with valid token returns user + tenant name', async () => {
    const user = mockUser()
    const token = createAdminToken()

    // authenticate middleware calls findUnique first (no tenant needed)
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ ...user, isActive: true } as any)
      // Route handler calls findUnique again with include: { tenant: true }
      .mockResolvedValueOnce({ ...user, tenant: mockTenant() } as any)

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('email')
    expect(res.body.data).toHaveProperty('role')
    expect(res.body.data.tenant).toHaveProperty('name')
  })

  test('1.5 — GET /api/auth/me without token returns 401', async () => {
    const res = await request(app).get('/api/auth/me')

    expect(res.status).toBe(401)
  })

  test('1.6 — GET /api/auth/me with expired token returns 401', async () => {
    const token = createExpiredToken()

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  test('1.8 — Logout returns success message', async () => {
    const res = await request(app).post('/api/auth/logout')

    expect(res.status).toBe(200)
    expect(res.body.data.message).toMatch(/logged out/i)
  })
})
