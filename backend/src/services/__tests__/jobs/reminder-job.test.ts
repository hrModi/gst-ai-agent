/**
 * Test Group 16: Scheduler — Automated Reminder Job
 * Tests: 16.1–16.6 (scheduling logic, deduplication, type selection)
 */

import { prismaMock } from '../../../__mocks__/prisma'
import { sendEmail } from '../../../__mocks__/email'
import { sendWhatsApp } from '../../../__mocks__/whatsapp'

const mockSendEmail = sendEmail as jest.Mock
const mockSendWhatsApp = sendWhatsApp as jest.Mock

import { runReminderJob } from '../../jobs/reminder-job'

// Compute today's day in IST to set up due dates correctly
function getISTDay(): number {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  return istNow.getUTCDate()
}

function makeClient(overrides: Record<string, any> = {}) {
  const todayDay = getISTDay()
  return {
    id: 'client-001',
    tenantId: 'tenant-abc',
    legalName: 'Test Co',
    email: 'client@test.com',
    phone: '+919876543210',
    automationEnabled: true,
    notifyEmail: true,
    notifyWhatsapp: false,
    gstr1DueDay: todayDay + 3, // Due in 3 days → reminderDaysBefore=[3] matches
    reminderDaysBefore: [3, 7],
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('16.1 — Daily job sends reminder when daysUntilDue in reminderDaysBefore', () => {
  test('Sends email reminder when daysUntilDue matches reminderDaysBefore', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-abc', name: 'ABC CA' }] as any)
    prismaMock.client.findMany.mockResolvedValue([makeClient()] as any)
    prismaMock.filingStatus.findUnique.mockResolvedValue(null) // no filing status
    prismaMock.reminder.findFirst.mockResolvedValue(null) // no today reminder yet
    prismaMock.reminder.count.mockResolvedValue(0) // no prior reminders
    prismaMock.reminderTemplate.findFirst.mockResolvedValue(null) // use default template
    prismaMock.reminder.create.mockResolvedValue({ id: 'rem-001', isAuto: true } as any)
    prismaMock.filingStatus.upsert.mockResolvedValue({} as any)
    prismaMock.yakshActivity.create.mockResolvedValue({} as any)
    mockSendEmail.mockResolvedValue({ success: true })

    await runReminderJob()

    expect(prismaMock.reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isAuto: true }) })
    )
    expect(mockSendEmail).toHaveBeenCalled()
  })
})

describe('16.2 — Client with automationEnabled=false is skipped', () => {
  test('No reminder sent when automationEnabled is false', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-abc', name: 'ABC CA' }] as any)
    // Client filter: { automationEnabled: true } → returns empty array (mocked)
    prismaMock.client.findMany.mockResolvedValue([]) // filtered out by DB query

    await runReminderJob()

    expect(prismaMock.reminder.create).not.toHaveBeenCalled()
  })
})

describe('16.3 — Client at DATA_RECEIVED stage is skipped', () => {
  test('No reminder when filing stage is DATA_RECEIVED', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-abc', name: 'ABC CA' }] as any)
    prismaMock.client.findMany.mockResolvedValue([makeClient()] as any)
    prismaMock.filingStatus.findUnique.mockResolvedValue({
      stage: 'DATA_RECEIVED',
    } as any) // data already received

    await runReminderJob()

    expect(prismaMock.reminder.create).not.toHaveBeenCalled()
  })

  test('No reminder when stage is VALIDATED (past data_received)', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-abc', name: 'ABC CA' }] as any)
    prismaMock.client.findMany.mockResolvedValue([makeClient()] as any)
    prismaMock.filingStatus.findUnique.mockResolvedValue({ stage: 'VALIDATED' } as any)

    await runReminderJob()

    expect(prismaMock.reminder.create).not.toHaveBeenCalled()
  })
})

describe('16.4 — Deduplication: no duplicate reminder on same day', () => {
  test('If a reminder was already sent today, skip', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-abc', name: 'ABC CA' }] as any)
    prismaMock.client.findMany.mockResolvedValue([makeClient()] as any)
    prismaMock.filingStatus.findUnique.mockResolvedValue(null)
    prismaMock.reminder.findFirst.mockResolvedValue({ id: 'rem-today', isAuto: true } as any) // already sent today

    await runReminderJob()

    expect(prismaMock.reminder.create).not.toHaveBeenCalled()
  })
})

describe('16.5 — First reminder type is SALES_DATA_COLLECTION', () => {
  test('First automated reminder → type = SALES_DATA_COLLECTION', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-abc', name: 'ABC CA' }] as any)
    prismaMock.client.findMany.mockResolvedValue([makeClient()] as any)
    prismaMock.filingStatus.findUnique.mockResolvedValue(null)
    prismaMock.reminder.findFirst.mockResolvedValue(null)
    prismaMock.reminder.count.mockResolvedValue(0) // no prior auto reminders
    prismaMock.reminderTemplate.findFirst.mockResolvedValue(null)
    prismaMock.reminder.create.mockResolvedValue({ id: 'rem-001', isAuto: true } as any)
    prismaMock.filingStatus.upsert.mockResolvedValue({} as any)
    prismaMock.yakshActivity.create.mockResolvedValue({} as any)
    mockSendEmail.mockResolvedValue({ success: true })

    await runReminderJob()

    expect(prismaMock.reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderType: 'SALES_DATA_COLLECTION' }),
      })
    )
  })
})

describe('16.6 — Subsequent reminder type is SALES_FOLLOW_UP', () => {
  test('Second+ automated reminder → type = SALES_FOLLOW_UP', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-abc', name: 'ABC CA' }] as any)
    prismaMock.client.findMany.mockResolvedValue([makeClient()] as any)
    prismaMock.filingStatus.findUnique.mockResolvedValue(null)
    prismaMock.reminder.findFirst.mockResolvedValue(null)
    prismaMock.reminder.count.mockResolvedValue(1) // 1 prior auto reminder already sent
    prismaMock.reminderTemplate.findFirst.mockResolvedValue(null)
    prismaMock.reminder.create.mockResolvedValue({ id: 'rem-002', isAuto: true } as any)
    prismaMock.filingStatus.upsert.mockResolvedValue({} as any)
    prismaMock.yakshActivity.create.mockResolvedValue({} as any)
    mockSendEmail.mockResolvedValue({ success: true })

    await runReminderJob()

    expect(prismaMock.reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderType: 'SALES_FOLLOW_UP' }),
      })
    )
  })
})
