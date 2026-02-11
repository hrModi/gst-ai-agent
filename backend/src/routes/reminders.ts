import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { reminderSchema } from '../services/validation/schemas'
import { sendEmail } from '../services/email'
import { sendWhatsApp } from '../services/whatsapp'
import { AuthRequest } from '../types'

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

    // Create the reminder
    const reminder = await prisma.reminder.create({
      data: {
        clientId: data.clientId,
        reminderType: data.reminderType,
        channel: data.channel,
        message: data.message,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        month: data.month,
        year: data.year,
        status: 'PENDING',
      },
    })

    // Attempt to send via appropriate channel
    let sendResult: { success: boolean } = { success: false }
    const messageText = data.message || `Reminder: Please submit your GST data for ${data.month}/${data.year}`

    try {
      if (data.channel === 'EMAIL' && client.email) {
        const emailResult = await sendEmail(
          client.email,
          `GST Filing Reminder - ${data.reminderType}`,
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
