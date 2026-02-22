/**
 * notification.ts — Centralised outbound notifications for pipeline events.
 *
 * Sends email / WhatsApp to the assigned consultant (or admin fallback)
 * using Yaksh-persona copy, based on client notification preferences.
 */
import { prisma } from '../lib/prisma'
import { sendEmail } from './email'
import { sendWhatsApp } from './whatsapp'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export type NotificationEvent = 'JSON_READY' | 'VALIDATION_FAILED'

interface EventData {
  valid?: number
  invalid?: number
  total?: number
  month?: number
  year?: number
}

function buildMessage(
  event: NotificationEvent,
  clientName: string,
  data: EventData
): { subject: string; body: string } {
  const monthLabel = data.month ? MONTH_NAMES[data.month] : ''
  const periodLabel = monthLabel && data.year ? `${monthLabel} ${data.year}` : ''

  if (event === 'JSON_READY') {
    return {
      subject: `Yaksh: GSTR-1 JSON ready — ${clientName}${periodLabel ? ` (${periodLabel})` : ''}`,
      body: `Hi,

Yaksh has finished processing ${clientName}'s sales data${periodLabel ? ` for ${periodLabel}` : ''}.

All ${data.total ?? 0} records passed validation. The GSTR-1 JSON is ready to file.

Please log in to the GST Filing System to download the JSON and upload it to the GST Portal.

— Yaksh (Automated)`,
    }
  }

  // VALIDATION_FAILED
  return {
    subject: `Yaksh: Action required — ${data.invalid} error(s) in ${clientName}${periodLabel ? ` (${periodLabel})` : ''}`,
    body: `Hi,

Yaksh detected ${data.invalid ?? 0} error(s) out of ${data.total ?? 0} records in ${clientName}'s sales data${periodLabel ? ` for ${periodLabel}` : ''}.

Please log in to the GST Filing System to review and correct the errors before filing.

— Yaksh (Automated)`,
  }
}

/**
 * Notify the consultant assigned to a client about a pipeline event.
 * Reads client's notifyEmail / notifyWhatsapp prefs.
 * Falls back to no-op if no contact info is available.
 */
export async function notifyConsultant(
  clientId: string,
  event: NotificationEvent,
  data: EventData
): Promise<void> {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        assignedUser: { select: { email: true, phone: true, name: true } },
      },
    })

    if (!client) return

    const { subject, body } = buildMessage(event, client.legalName, data)

    // Determine recipient — prefer assigned consultant, fall back to client contact
    const recipientEmail = client.assignedUser?.email || client.email || null
    const recipientPhone = client.assignedUser?.phone || client.phone || null

    const sends: Promise<any>[] = []

    if (client.notifyEmail && recipientEmail) {
      sends.push(sendEmail(recipientEmail, subject, body))
    }

    if (client.notifyWhatsapp && recipientPhone) {
      const whatsappMsg = `${subject}\n\n${body}`
      sends.push(sendWhatsApp(recipientPhone, whatsappMsg))
    }

    await Promise.allSettled(sends)

    // Log activity
    await prisma.yakshActivity.create({
      data: {
        tenantId: client.tenantId,
        clientId,
        activityType: 'NOTIFICATION_SENT',
        description: `Yaksh sent ${event} notification for ${client.legalName}`,
        metadata: { event, recipientEmail, data } as any,
      },
    }).catch(console.error)
  } catch (err) {
    console.error('[Notification] Failed to send notification:', err)
  }
}
