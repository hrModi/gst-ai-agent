import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()

router.use(authenticate)

const DEFAULT_TEMPLATES: Record<string, Record<string, { subject?: string; body: string }>> = {
  DATA_COLLECTION: {
    EMAIL: {
      subject: 'GST Data Required for {month} {year}',
      body: "Dear {clientName},\n\nWe haven't received your GST data for {month} {year}. Please submit at the earliest.\n\nRegards,\nTeam",
    },
    WHATSAPP: {
      body: 'Hi {clientName}, reminder to submit your GST data for {month} {year} to avoid filing delays.',
    },
    SMS: {
      body: 'Hi {clientName}, please submit GST data for {month} {year}. Contact {consultantName}.',
    },
  },
  FILING_DEADLINE: {
    EMAIL: {
      subject: 'URGENT: GST Filing Deadline on {dueDate}',
      body: 'Dear {clientName},\n\nYour GSTR-1 is due on {dueDate}. Please act immediately.\n\nRegards,\nTeam',
    },
    WHATSAPP: {
      body: 'URGENT: {clientName}, GST filing deadline is {dueDate}. Contact {consultantName} immediately.',
    },
    SMS: {
      body: 'URGENT: {clientName} GST deadline {dueDate}. Call {consultantName} now.',
    },
  },
  FOLLOW_UP: {
    EMAIL: {
      subject: 'Follow-up: GST Data for {month} {year}',
      body: 'Dear {clientName},\n\nThis is a follow-up for the pending GST data submission for {month} {year}.\n\nRegards,\nTeam',
    },
    WHATSAPP: {
      body: 'Hi {clientName}, following up on your GST data for {month} {year}.',
    },
    SMS: {
      body: 'Hi {clientName}, please submit GST data for {month} {year}. Urgent.',
    },
  },
}

// GET /api/reminder-templates (Admin only)
router.get('/', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const templates = await prisma.reminderTemplate.findMany({
      where: { tenantId: req.user!.tenantId, isActive: true },
    })

    // Merge DB templates with defaults
    const result: Record<string, Record<string, { subject?: string; body: string; isCustom: boolean }>> = {}

    for (const [reminderType, channels] of Object.entries(DEFAULT_TEMPLATES)) {
      result[reminderType] = {}
      for (const [channel, defaults] of Object.entries(channels)) {
        const dbTemplate = templates.find(
          (t) => t.reminderType === reminderType && t.channel === channel
        )
        result[reminderType][channel] = {
          subject: dbTemplate?.subject ?? defaults.subject,
          body: dbTemplate?.body ?? defaults.body,
          isCustom: !!dbTemplate,
        }
      }
    }

    res.json({ data: result })
  } catch (error) {
    console.error('Get reminder templates error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/reminder-templates/:reminderType/:channel (Admin only)
router.put('/:reminderType/:channel', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { reminderType, channel } = req.params as { reminderType: string; channel: string }
    const { subject, body } = req.body

    if (!body || typeof body !== 'string') {
      res.status(400).json({ error: 'body is required' })
      return
    }

    const validTypes = ['DATA_COLLECTION', 'FILING_DEADLINE', 'FOLLOW_UP']
    const validChannels = ['EMAIL', 'WHATSAPP', 'SMS']

    if (!validTypes.includes(reminderType)) {
      res.status(400).json({ error: 'Invalid reminderType' })
      return
    }
    if (!validChannels.includes(channel)) {
      res.status(400).json({ error: 'Invalid channel' })
      return
    }

    const template = await prisma.reminderTemplate.upsert({
      where: {
        tenantId_reminderType_channel: {
          tenantId: req.user!.tenantId,
          reminderType,
          channel,
        },
      },
      create: {
        tenantId: req.user!.tenantId,
        reminderType,
        channel,
        subject: subject || null,
        body,
      },
      update: {
        subject: subject || null,
        body,
      },
    })

    res.json({ data: template })
  } catch (error) {
    console.error('Update reminder template error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { DEFAULT_TEMPLATES }
export default router
