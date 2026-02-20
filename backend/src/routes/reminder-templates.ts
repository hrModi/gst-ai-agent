import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()

router.use(authenticate)

const DEFAULT_TEMPLATES: Record<string, Record<string, { subject?: string; body: string }>> = {
  SALES_DATA_COLLECTION: {
    EMAIL: {
      subject: 'Sales Invoice Data Required for {month} {year}',
      body: 'Dear {clientName},\n\nWe need your sales invoices for {month} {year} to file your GSTR-1. Please share at the earliest.\n\nRegards,\nTeam',
    },
    WHATSAPP: {
      body: 'Hi {clientName}, please share your sales invoices for {month} {year} so we can file your GSTR-1 on time.',
    },
    SMS: {
      body: 'Hi {clientName}, please share sales invoices for {month} {year} for GSTR-1 filing. Contact {consultantName}.',
    },
  },
  PURCHASE_DATA_COLLECTION: {
    EMAIL: {
      subject: 'Purchase & ITC Data Required for {month} {year}',
      body: 'Dear {clientName},\n\nWe need your purchase invoices and ITC data for {month} {year} to file your GSTR-3B. Please share at the earliest.\n\nRegards,\nTeam',
    },
    WHATSAPP: {
      body: 'Hi {clientName}, please share your purchase/ITC data for {month} {year} so we can file your GSTR-3B on time.',
    },
    SMS: {
      body: 'Hi {clientName}, please share purchase/ITC data for {month} {year} for GSTR-3B filing. Contact {consultantName}.',
    },
  },
  SALES_FOLLOW_UP: {
    EMAIL: {
      subject: 'Reminder: Sales Data Pending for {month} {year}',
      body: "Dear {clientName},\n\nThis is a follow-up. We still haven't received your sales invoices for {month} {year}. Please share urgently to avoid GSTR-1 filing delays.\n\nRegards,\nTeam",
    },
    WHATSAPP: {
      body: 'Hi {clientName}, following up — sales invoices for {month} {year} are still pending. Please share asap.',
    },
    SMS: {
      body: '{clientName}, sales invoices for {month} {year} still pending. Contact {consultantName} urgently.',
    },
  },
  PURCHASE_FOLLOW_UP: {
    EMAIL: {
      subject: 'Reminder: Purchase Data Pending for {month} {year}',
      body: "Dear {clientName},\n\nThis is a follow-up. We still haven't received your purchase/ITC data for {month} {year}. Please share urgently to avoid GSTR-3B filing delays.\n\nRegards,\nTeam",
    },
    WHATSAPP: {
      body: 'Hi {clientName}, following up — purchase/ITC data for {month} {year} is still pending. Please share asap.',
    },
    SMS: {
      body: '{clientName}, purchase/ITC data for {month} {year} still pending. Contact {consultantName} urgently.',
    },
  },
  GSTR1_DEADLINE: {
    EMAIL: {
      subject: 'Urgent: GSTR-1 Filing Deadline is {dueDate}',
      body: 'Dear {clientName},\n\nThe GSTR-1 filing deadline is {dueDate}. Please submit your sales invoices to us immediately to avoid a late filing.\n\nRegards,\nTeam',
    },
    WHATSAPP: {
      body: 'Urgent {clientName}: GSTR-1 deadline is {dueDate}. Please submit your sales data to us immediately.',
    },
    SMS: {
      body: 'URGENT {clientName}: GSTR-1 deadline {dueDate}. Share sales data now. Call {consultantName}.',
    },
  },
  GSTR3B_DEADLINE: {
    EMAIL: {
      subject: 'Urgent: GSTR-3B Filing Deadline is {dueDate}',
      body: 'Dear {clientName},\n\nThe GSTR-3B filing deadline is {dueDate}. Please submit your purchase/ITC data to us immediately to avoid a late filing.\n\nRegards,\nTeam',
    },
    WHATSAPP: {
      body: 'Urgent {clientName}: GSTR-3B deadline is {dueDate}. Please submit your purchase/ITC data to us immediately.',
    },
    SMS: {
      body: 'URGENT {clientName}: GSTR-3B deadline {dueDate}. Share purchase data now. Call {consultantName}.',
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

    const validTypes = ['SALES_DATA_COLLECTION', 'PURCHASE_DATA_COLLECTION', 'SALES_FOLLOW_UP', 'PURCHASE_FOLLOW_UP', 'GSTR1_DEADLINE', 'GSTR3B_DEADLINE']
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
