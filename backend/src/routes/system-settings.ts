import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth'
import { createAuditLog } from '../services/audit'
import { AuthRequest } from '../types'

const router = Router()

router.use(authenticate)

const SETTINGS_KEYS = ['gstr1DueDay', 'gstr3bDueDay', 'reminderDaysBefore'] as const

// GET /api/system-settings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        tenantId: req.user!.tenantId,
        settingKey: { in: [...SETTINGS_KEYS] },
      },
    })

    const result: Record<string, any> = {
      gstr1DueDay: 11,
      gstr3bDueDay: 20,
      reminderDaysBefore: [7, 3, 1],
    }

    for (const s of settings) {
      if (s.settingKey === 'gstr1DueDay') result.gstr1DueDay = parseInt(s.settingValue, 10)
      else if (s.settingKey === 'gstr3bDueDay') result.gstr3bDueDay = parseInt(s.settingValue, 10)
      else if (s.settingKey === 'reminderDaysBefore') {
        try { result.reminderDaysBefore = JSON.parse(s.settingValue) } catch { /* keep default */ }
      }
    }

    res.json({ data: result })
  } catch (error) {
    console.error('Get system settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/system-settings (Admin only)
router.put('/', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { gstr1DueDay, gstr3bDueDay, reminderDaysBefore } = req.body

    const updates: { key: string; value: string }[] = []

    if (gstr1DueDay !== undefined) {
      const day = parseInt(gstr1DueDay, 10)
      if (isNaN(day) || day < 1 || day > 28) {
        res.status(400).json({ error: 'gstr1DueDay must be between 1 and 28' })
        return
      }
      updates.push({ key: 'gstr1DueDay', value: String(day) })
    }

    if (gstr3bDueDay !== undefined) {
      const day = parseInt(gstr3bDueDay, 10)
      if (isNaN(day) || day < 1 || day > 28) {
        res.status(400).json({ error: 'gstr3bDueDay must be between 1 and 28' })
        return
      }
      updates.push({ key: 'gstr3bDueDay', value: String(day) })
    }

    if (reminderDaysBefore !== undefined) {
      if (!Array.isArray(reminderDaysBefore)) {
        res.status(400).json({ error: 'reminderDaysBefore must be an array' })
        return
      }
      updates.push({ key: 'reminderDaysBefore', value: JSON.stringify(reminderDaysBefore) })
    }

    for (const { key, value } of updates) {
      await prisma.systemSetting.upsert({
        where: { tenantId_settingKey: { tenantId: req.user!.tenantId, settingKey: key } },
        create: { tenantId: req.user!.tenantId, settingKey: key, settingValue: value, updatedBy: req.user!.id },
        update: { settingValue: value, updatedBy: req.user!.id },
      })
    }

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'UPDATE',
      entityType: 'SYSTEM_SETTINGS',
      newValue: req.body,
      ipAddress: req.ip,
    })

    res.json({ data: { message: 'System settings updated successfully' } })
  } catch (error) {
    console.error('Update system settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
