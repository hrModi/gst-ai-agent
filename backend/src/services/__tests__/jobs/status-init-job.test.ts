/**
 * Test Group 16: Scheduler — Status Init Job
 * Tests: 16.7–16.8 (monthly filing status initialization)
 */

import { prismaMock } from '../../../__mocks__/prisma'
import { runStatusInitJob } from '../../jobs/status-init-job'

const mockClients = [
  { id: 'client-001', tenantId: 'tenant-abc' },
  { id: 'client-002', tenantId: 'tenant-abc' },
]

describe('16.7 — Monthly status-init job upserts FilingStatus for all active clients', () => {
  test('Creates FilingStatus records for all active clients', async () => {
    prismaMock.client.findMany.mockResolvedValue(mockClients as any)
    // Upsert returns a new record (stage=NOT_STARTED, stageUpdatedAt=now)
    const now = new Date()
    prismaMock.filingStatus.upsert.mockResolvedValue({
      id: 'fs-001',
      stage: 'NOT_STARTED',
      stageUpdatedAt: now,
    } as any)
    prismaMock.yakshActivity.create.mockResolvedValue({} as any)

    await runStatusInitJob()

    // Should be called once per client
    expect(prismaMock.filingStatus.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.filingStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId_month_year: expect.objectContaining({ clientId: 'client-001' }),
        }),
        create: expect.objectContaining({ stage: 'NOT_STARTED' }),
      })
    )
  })

  test('FilingStatus query scoped to active clients only', async () => {
    prismaMock.client.findMany.mockResolvedValue(mockClients as any)
    prismaMock.filingStatus.upsert.mockResolvedValue({ id: 'fs', stage: 'NOT_STARTED', stageUpdatedAt: new Date() } as any)
    prismaMock.yakshActivity.create.mockResolvedValue({} as any)

    await runStatusInitJob()

    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE' },
      })
    )
  })
})

describe('16.8 — Status-init never overwrites an existing stage', () => {
  test('Upsert update: {} pattern ensures no stage overwrite', async () => {
    prismaMock.client.findMany.mockResolvedValue([{ id: 'client-001', tenantId: 'tenant-abc' }] as any)
    prismaMock.filingStatus.upsert.mockResolvedValue({
      id: 'fs-existing',
      stage: 'DATA_RECEIVED', // existing stage
      stageUpdatedAt: new Date('2026-01-15'), // old date
    } as any)
    prismaMock.yakshActivity.create.mockResolvedValue({} as any)

    await runStatusInitJob()

    // The update clause must be empty (not overwrite stage)
    expect(prismaMock.filingStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {}, // empty update — never overwrites existing stage
      })
    )
  })
})
