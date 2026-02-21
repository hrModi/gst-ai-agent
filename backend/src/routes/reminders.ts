import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { reminderSchema } from '../services/validation/schemas'
import { sendEmail } from '../services/email'
import { sendWhatsApp } from '../services/whatsapp'
import { DEFAULT_TEMPLATES } from './reminder-templates'
import { AuthRequest } from '../types'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function applyPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

const router = Router()

// All routes require authentication
router.use(authenticate)

// POST /api/reminders
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = reminderSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return
    }

    const data = parsed.data

    // Verify client belongs to tenant
    const clientWhere: any = {
      id: data.clientId,
      tenantId: req.user!.tenantId,
    }
    if (req.user!.role === 'CONSULTANT') {
      clientWhere.assignedTo = req.user!.id
    }
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    // Resolve message from template if not provided
    let resolvedMessage = data.message || null
    let resolvedSubject = `GST Filing Reminder - ${data.reminderType}`

    if (!resolvedMessage) {
      // Look up custom template
      const dbTemplate = await prisma.reminderTemplate.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          reminderType: data.reminderType,
          channel: data.channel,
          isActive: true,
        },
      })

      const templateDefaults = DEFAULT_TEMPLATES[data.reminderType]?.[data.channel]
      const templateBody = dbTemplate?.body ?? templateDefaults?.body ?? `Reminder: Please submit your GST data.`
      const templateSubject = dbTemplate?.subject ?? (templateDefaults as any)?.subject ?? resolvedSubject

      const monthName = data.month ? MONTH_NAMES[data.month - 1] : ''
      const vars: Record<string, string> = {
        clientName: client.legalName,
        month: monthName,
        year: data.year ? String(data.year) : '',
        dueDate: '',
        consultantName: '',
      }

      resolvedMessage = applyPlaceholders(templateBody, vars)
      resolvedSubject = applyPlaceholders(templateSubject, vars)
    }

    // Create the reminder
    const reminder = await prisma.reminder.create({
      data: {
        clientId: data.clientId,
        reminderType: data.reminderType,
        channel: data.channel,
        message: resolvedMessage,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        month: data.month,
        year: data.year,
        status: 'PENDING',
      },
    })

    // Attempt to send via appropriate channel
    let sendResult: { success: boolean } = { success: false }
    const messageText = resolvedMessage

    try {
      if (data.channel === 'EMAIL' && client.email) {
        const emailResult = await sendEmail(
          client.email,
          resolvedSubject,
          messageText
        )
        sendResult = { success: emailResult.success }
      } else if (data.channel === 'WHATSAPP' && client.phone) {
        sendResult = await sendWhatsApp(client.phone, messageText)
      } else if (data.channel === 'SMS' && client.phone) {
        // SMS stub - same as WhatsApp for now
        console.log(`--- SMS STUB --- Phone: ${client.phone}, Message: ${messageText}`)
        sendResult = { success: true }
      } else {
        console.log(`No contact info for channel ${data.channel} on client ${client.legalName}`)
        sendResult = { success: false }
      }
    } catch (sendError) {
      console.error('Failed to send reminder:', sendError)
      sendResult = { success: false }
    }

    // Update reminder status
    const updatedReminder = await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        status: sendResult.success ? 'SENT' : 'FAILED',
        sentAt: sendResult.success ? new Date() : null,
      },
    })

    res.status(201).json({ data: updatedReminder })
  } catch (error) {
    console.error('Create reminder error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/reminders/schedule — upcoming automated reminder events for current month
router.get('/schedule', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const istNow = new Date(now.getTime() + istOffset)
    const todayDay = istNow.getUTCDate()
    const currentMonth = istNow.getUTCMonth() + 1
    const currentYear = istNow.getUTCFullYear()

    const clientWhere: any = {
      tenantId: req.user!.tenantId,
      status: 'ACTIVE',
      automationEnabled: true,
    }
    if (req.user!.role === 'CONSULTANT') {
      clientWhere.assignedTo = req.user!.id
    }

    const clients = await prisma.client.findMany({
      where: clientWhere,
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        gstr1DueDay: true,
        reminderDaysBefore: true,
        notifyEmail: true,
        notifyWhatsapp: true,
        email: true,
        phone: true,
        filingStatus: {
          where: { month: currentMonth, year: currentYear },
          select: { stage: true },
        },
      },
    })

    const DATA_RECEIVED_STAGES = new Set([
      'DATA_RECEIVED', 'VALIDATING', 'VALIDATION_FAILED', 'VALIDATED',
      'JSON_GENERATED', 'READY_TO_FILE', 'FILED',
    ])

    const schedule: any[] = []

    for (const client of clients) {
      const currentStage = client.filingStatus[0]?.stage
      if (currentStage && DATA_RECEIVED_STAGES.has(currentStage)) continue

      const channels: string[] = []
      if (client.notifyEmail && client.email) channels.push('EMAIL')
      if (client.notifyWhatsapp && client.phone) channels.push('WHATSAPP')
      if (channels.length === 0) continue

      for (const daysBefore of client.reminderDaysBefore) {
        const daysUntilDue = client.gstr1DueDay - todayDay
        const targetDay = client.gstr1DueDay - daysBefore

        // Only include future or today's events
        if (targetDay < todayDay) continue

        // Build scheduled date string for current month
        const scheduledDate = new Date(Date.UTC(currentYear, currentMonth - 1, targetDay))

        schedule.push({
          clientId: client.id,
          clientName: client.legalName,
          tradeName: client.tradeName,
          reminderType: daysUntilDue === 0 ? 'GSTR1_DEADLINE' : 'SALES_DATA_COLLECTION',
          channels,
          scheduledDate: scheduledDate.toISOString().split('T')[0],
          daysUntilDue: targetDay - todayDay,
          gstr1DueDay: client.gstr1DueDay,
          currentStage: currentStage || 'NOT_STARTED',
        })
      }
    }

    // Sort by scheduledDate ascending
    schedule.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

    res.json({ data: schedule, month: currentMonth, year: currentYear })
  } catch (error) {
    console.error('Get reminder schedule error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/reminders
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, month, year, status, channel } = req.query

    const where: any = {
      client: { tenantId: req.user!.tenantId },
    }

    if (req.user!.role === 'CONSULTANT') {
      where.client.assignedTo = req.user!.id
    }

    if (clientId) where.clientId = clientId as string
    if (month) where.month = parseInt(month as string, 10)
    if (year) where.year = parseInt(year as string, 10)
    if (status) where.status = status as string
    if (channel) where.channel = channel as string

    const reminders = await prisma.reminder.findMany({
      where,
      include: {
        client: {
          select: { id: true, legalName: true, tradeName: true, gstin: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ data: reminders })
  } catch (error) {
    console.error('Get reminders error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
