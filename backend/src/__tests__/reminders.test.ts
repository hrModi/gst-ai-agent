/**
 * Test Groups 12–15: Reminders — Send, Schedule, Logs
 * Tests: 12.1–12.6, 14.1, 14.3, 15.1–15.6
 */

import request from 'supertest'
import app from '../app'
import { prismaMock } from '../__mocks__/prisma'
import { sendEmail } from '../__mocks__/email'
import { sendWhatsApp } from '../__mocks__/whatsapp'
import { mockUser, mockClient, mockReminder, mockConsultant, mockReminderTemplate } from './helpers/factories'
import { createAdminToken, createConsultantToken } from './helpers/auth'

const adminToken = `Bearer ${createAdminToken()}`
const consultantToken = `Bearer ${createConsultantToken()}`

const mockSendEmail = sendEmail as jest.Mock
const mockSendWhatsApp = sendWhatsApp as jest.Mock

function setupAdmin() {
  prismaMock.user.findUnique.mockResolvedValue(mockUser({ isActive: true }) as any)
}

function setupConsultant() {
  prismaMock.user.findUnique.mockResolvedValue(mockConsultant({ isActive: true }) as any)
}

// ─── Group 12: Send Tab ────────────────────────────────────────────────────────

describe('POST /api/reminders — Send Reminder', () => {
  test('12.1 — Admin sends a reminder, it is logged in DB', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(
      mockClient({ email: 'client@test.com', phone: '+919876543210' }) as any
    )
    prismaMock.reminderTemplate.findFirst.mockResolvedValue(null) // use default template
    prismaMock.reminder.create.mockResolvedValue(mockReminder() as any)
    prismaMock.reminder.update.mockResolvedValue(mockReminder({ status: 'SENT' }) as any)
    mockSendEmail.mockResolvedValue({ success: true })

    const res = await request(app)
      .post('/api/reminders')
      .set('Authorization', adminToken)
      .send({
        clientId: 'c0000000-0000-0000-0000-000000000001',
        reminderType: 'SALES_DATA_COLLECTION',
        channel: 'EMAIL',
        month: 1,
        year: 2026,
      })

    expect(res.status).toBe(201)
    expect(prismaMock.reminder.create).toHaveBeenCalled()
  })

  test('12.5 — Send via Email calls sendEmail service', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(
      mockClient({ email: 'client@test.com' }) as any
    )
    prismaMock.reminderTemplate.findFirst.mockResolvedValue(null)
    prismaMock.reminder.create.mockResolvedValue(mockReminder() as any)
    prismaMock.reminder.update.mockResolvedValue(mockReminder({ status: 'SENT' }) as any)
    mockSendEmail.mockResolvedValue({ success: true })

    await request(app)
      .post('/api/reminders')
      .set('Authorization', adminToken)
      .send({ clientId: 'c0000000-0000-0000-0000-000000000001', reminderType: 'SALES_DATA_COLLECTION', channel: 'EMAIL', month: 1, year: 2026 })

    expect(mockSendEmail).toHaveBeenCalled()
  })

  test('12.6 — Send via WhatsApp calls sendWhatsApp service', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(
      mockClient({ phone: '+919876543210' }) as any
    )
    prismaMock.reminderTemplate.findFirst.mockResolvedValue(null)
    prismaMock.reminder.create.mockResolvedValue(mockReminder({ channel: 'WHATSAPP' }) as any)
    prismaMock.reminder.update.mockResolvedValue(mockReminder({ channel: 'WHATSAPP', status: 'SENT' }) as any)
    mockSendWhatsApp.mockResolvedValue({ success: true })

    await request(app)
      .post('/api/reminders')
      .set('Authorization', adminToken)
      .send({ clientId: 'c0000000-0000-0000-0000-000000000001', reminderType: 'SALES_DATA_COLLECTION', channel: 'WHATSAPP', month: 1, year: 2026 })

    expect(mockSendWhatsApp).toHaveBeenCalled()
  })

  test('12.1b — Sending reminder to non-tenant client returns 404', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(null) // client not in tenant

    const res = await request(app)
      .post('/api/reminders')
      .set('Authorization', adminToken)
      // Use a valid UUID format for clientId (schema requires UUID)
      .send({ clientId: 'a0000000-0000-0000-0000-000000000001', reminderType: 'SALES_DATA_COLLECTION', channel: 'EMAIL', month: 1, year: 2026 })

    expect(res.status).toBe(404)
  })

  test('12.1c — Consultant can only send to assigned client', async () => {
    setupConsultant()
    prismaMock.client.findFirst.mockResolvedValue(null) // not assigned to this consultant

    const res = await request(app)
      .post('/api/reminders')
      .set('Authorization', consultantToken)
      // Use a valid UUID format for clientId (schema requires UUID)
      .send({ clientId: 'b0000000-0000-0000-0000-000000000002', reminderType: 'SALES_DATA_COLLECTION', channel: 'EMAIL', month: 1, year: 2026 })

    expect(res.status).toBe(404)
  })

  test('12.3 — Template placeholders resolved (clientName substituted)', async () => {
    setupAdmin()
    prismaMock.client.findFirst.mockResolvedValue(
      mockClient({ legalName: 'Placeholder Corp', email: 'p@test.com' }) as any
    )
    prismaMock.reminderTemplate.findFirst.mockResolvedValue(null) // use default
    prismaMock.reminder.create.mockResolvedValue(mockReminder() as any)
    prismaMock.reminder.update.mockResolvedValue(mockReminder() as any)
    mockSendEmail.mockResolvedValue({ success: true })

    await request(app)
      .post('/api/reminders')
      .set('Authorization', adminToken)
      .send({ clientId: 'c0000000-0000-0000-0000-000000000001', reminderType: 'SALES_DATA_COLLECTION', channel: 'EMAIL', month: 1, year: 2026 })

    // Inspect the message that was stored in the reminder create call
    const createCall = (prismaMock.reminder.create as jest.Mock).mock.calls[0]
    const createdMessage: string = createCall[0].data.message
    expect(createdMessage).toContain('Placeholder Corp')
  })
})

// ─── Group 15: Logs Tab ────────────────────────────────────────────────────────

describe('GET /api/reminders — Logs', () => {
  test('15.1 — Admin views all sent reminders', async () => {
    setupAdmin()
    prismaMock.reminder.findMany.mockResolvedValue([
      { ...mockReminder(), client: { id: 'client-001', legalName: 'Test Co', tradeName: null, gstin: '27AABCU9603R1ZX' } },
    ] as any)

    const res = await request(app)
      .get('/api/reminders')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  test('15.2 — Filter by clientId', async () => {
    setupAdmin()
    prismaMock.reminder.findMany.mockResolvedValue([
      { ...mockReminder(), client: { id: 'client-001', legalName: 'Test Co', tradeName: null, gstin: '27AABCU9603R1ZX' } },
    ] as any)

    const res = await request(app)
      .get('/api/reminders?clientId=client-001')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(prismaMock.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: 'client-001' }),
      })
    )
  })

  test('15.3 — Filter by channel = EMAIL', async () => {
    setupAdmin()
    prismaMock.reminder.findMany.mockResolvedValue([
      { ...mockReminder({ channel: 'EMAIL' }), client: { id: 'c1', legalName: 'A', tradeName: null, gstin: 'X' } },
    ] as any)

    const res = await request(app)
      .get('/api/reminders?channel=EMAIL')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(prismaMock.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ channel: 'EMAIL' }) })
    )
  })

  test('15.4 — Filter by month/year', async () => {
    setupAdmin()
    prismaMock.reminder.findMany.mockResolvedValue([] as any)

    await request(app)
      .get('/api/reminders?month=2&year=2026')
      .set('Authorization', adminToken)

    expect(prismaMock.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ month: 2, year: 2026 }),
      })
    )
  })

  test('15.5 — Auto-sent reminders have isAuto=true in DB record', async () => {
    setupAdmin()
    prismaMock.reminder.findMany.mockResolvedValue([
      { ...mockReminder({ isAuto: true }), client: { id: 'c1', legalName: 'A', tradeName: null, gstin: 'X' } },
      { ...mockReminder({ isAuto: false }), client: { id: 'c2', legalName: 'B', tradeName: null, gstin: 'Y' } },
    ] as any)

    const res = await request(app)
      .get('/api/reminders')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(res.body.data[0].isAuto).toBe(true)
    expect(res.body.data[1].isAuto).toBe(false)
  })
})

// ─── Group 14: Schedule Tab ────────────────────────────────────────────────────

describe('GET /api/reminders/schedule', () => {
  test('14.1 — Returns upcoming automated reminder events', async () => {
    setupAdmin()
    // Client with automationEnabled=true and future due date
    const now = new Date()
    const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
    const todayDay = istNow.getUTCDate()
    // Set due day to todayDay + 5 so daysUntilDue = 5
    const dueDay = todayDay + 5 <= 28 ? todayDay + 5 : 28

    prismaMock.client.findMany.mockResolvedValue([
      {
        ...mockClient({
          automationEnabled: true,
          gstr1DueDay: dueDay,
          reminderDaysBefore: [7, 3],
          notifyEmail: true,
          notifyWhatsapp: false,
          email: 'c@test.com',
          phone: null,
        }),
        filingStatus: [],
      },
    ] as any)

    const res = await request(app)
      .get('/api/reminders/schedule')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('14.3 — Clients with automationEnabled=false excluded from schedule', async () => {
    setupAdmin()
    prismaMock.client.findMany.mockResolvedValue([] as any) // filter applied in DB query

    const res = await request(app)
      .get('/api/reminders/schedule')
      .set('Authorization', adminToken)

    expect(res.status).toBe(200)
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ automationEnabled: true }),
      })
    )
  })
})
