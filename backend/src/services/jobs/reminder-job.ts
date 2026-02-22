import { prisma } from '../../lib/prisma'
import { sendEmail } from '../email'
import { sendWhatsApp, sendWhatsAppTemplate } from '../whatsapp'
import { DEFAULT_TEMPLATES } from '../../routes/reminder-templates'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function applyPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

// Stages where data has already been received — skip reminders for these
const DATA_RECEIVED_STAGES = new Set([
  'DATA_RECEIVED', 'VALIDATING', 'VALIDATION_FAILED', 'VALIDATED',
  'JSON_GENERATED', 'READY_TO_FILE', 'FILED',
])

export async function runReminderJob() {
  const now = new Date()
  // Work in IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  const todayDay = istNow.getUTCDate()
  const currentMonth = istNow.getUTCMonth() + 1
  const currentYear = istNow.getUTCFullYear()

  // Start of today in IST (midnight IST)
  const startOfTodayIST = new Date(istNow)
  startOfTodayIST.setUTCHours(0, 0, 0, 0)
  const startOfTodayUTC = new Date(startOfTodayIST.getTime() - istOffset)

  console.log(`[ReminderJob] Running for ${currentMonth}/${currentYear}, day ${todayDay}`)

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } })

    for (const tenant of tenants) {
      const clients = await prisma.client.findMany({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE',
          automationEnabled: true,
        },
      })

      let remindersSent = 0

      for (const client of clients) {
        const daysUntilDue = client.gstr1DueDay - todayDay

        // Skip if past due or this day is not in reminderDaysBefore
        if (daysUntilDue < 0) continue
        if (!client.reminderDaysBefore.includes(daysUntilDue)) continue

        // Check if data already received for this month
        const filingStatus = await prisma.filingStatus.findUnique({
          where: { clientId_month_year: { clientId: client.id, month: currentMonth, year: currentYear } },
        })
        if (filingStatus && DATA_RECEIVED_STAGES.has(filingStatus.stage)) continue

        // Deduplicate: skip if already sent a reminder today for this client/month
        const todayReminder = await prisma.reminder.findFirst({
          where: {
            clientId: client.id,
            month: currentMonth,
            year: currentYear,
            isAuto: true,
            createdAt: { gte: startOfTodayUTC },
          },
        })
        if (todayReminder) continue

        // Determine reminder type: first reminder = SALES_DATA_COLLECTION, subsequent = SALES_FOLLOW_UP
        const priorCount = await prisma.reminder.count({
          where: {
            clientId: client.id,
            month: currentMonth,
            year: currentYear,
            isAuto: true,
            reminderType: { in: ['SALES_DATA_COLLECTION', 'SALES_FOLLOW_UP'] },
            createdAt: { lt: startOfTodayUTC },
          },
        })
        const reminderType = priorCount === 0 ? 'SALES_DATA_COLLECTION' : 'SALES_FOLLOW_UP'

        const monthName = MONTH_NAMES[currentMonth - 1]
        const dueDate = `${client.gstr1DueDay} ${monthName} ${currentYear}`
        const contactPerson = (client as any).contactPerson || client.legalName
        const vars = {
          clientName: client.legalName,
          contactPerson,
          month: monthName,
          year: String(currentYear),
          dueDate,
          consultantName: '',
        }

        const channels: Array<'EMAIL' | 'WHATSAPP'> = []
        if (client.notifyEmail && client.email) channels.push('EMAIL')
        if (client.notifyWhatsapp && client.phone) channels.push('WHATSAPP')

        for (const channel of channels) {
          // Resolve template: DB override → default
          const dbTemplate = await prisma.reminderTemplate.findFirst({
            where: { tenantId: tenant.id, reminderType, channel, isActive: true },
          })
          const templateDefaults = DEFAULT_TEMPLATES[reminderType]?.[channel]
          const body = dbTemplate?.body ?? templateDefaults?.body ?? 'Please submit your GST data for {month} {year}.'
          const subject = (dbTemplate as any)?.subject ?? (templateDefaults as any)?.subject ?? `GST Filing Reminder - ${monthName} ${currentYear}`

          const resolvedBody = applyPlaceholders(body, vars)
          const resolvedSubject = applyPlaceholders(subject, vars)

          let success = false
          try {
            if (channel === 'EMAIL' && client.email) {
              const result = await sendEmail(client.email, resolvedSubject, resolvedBody)
              success = result.success
            } else if (channel === 'WHATSAPP' && client.phone) {
              const envKey = `GUPSHUP_TEMPLATE_${reminderType}`
              const elementName = process.env[envKey]
              if (elementName) {
                const templateParams = [contactPerson, client.legalName, monthName, String(currentYear)]
                const result = await sendWhatsAppTemplate(client.phone, elementName, templateParams)
                success = result.success
              } else {
                const result = await sendWhatsApp(client.phone, resolvedBody)
                success = result.success
              }
            }
          } catch (err) {
            console.error(`[ReminderJob] Send failed for ${client.legalName} via ${channel}:`, err)
          }

          await prisma.reminder.create({
            data: {
              clientId: client.id,
              reminderType,
              channel,
              message: resolvedBody,
              status: success ? 'SENT' : 'FAILED',
              sentAt: success ? new Date() : null,
              month: currentMonth,
              year: currentYear,
              isAuto: true,
            },
          })
        }

        // Update FilingStatus stage to REMINDER_SENT on first reminder
        if (priorCount === 0) {
          await prisma.filingStatus.upsert({
            where: { clientId_month_year: { clientId: client.id, month: currentMonth, year: currentYear } },
            create: {
              clientId: client.id,
              month: currentMonth,
              year: currentYear,
              stage: 'REMINDER_SENT',
              stageUpdatedAt: new Date(),
            },
            update: {
              stage: 'REMINDER_SENT',
              stageUpdatedAt: new Date(),
            },
          })
        }

        // Log YakshActivity
        await prisma.yakshActivity.create({
          data: {
            tenantId: tenant.id,
            clientId: client.id,
            activityType: 'REMINDER_SENT',
            description: `Yaksh sent ${reminderType === 'SALES_DATA_COLLECTION' ? 'data collection' : 'follow-up'} reminder to ${client.legalName} (${daysUntilDue}d before due)`,
            metadata: {
              reminderType,
              channels,
              daysUntilDue,
              month: currentMonth,
              year: currentYear,
            },
          },
        })

        remindersSent++
      }

      if (remindersSent > 0) {
        console.log(`[ReminderJob] Tenant "${tenant.name}": sent ${remindersSent} reminder(s)`)
      }
    }

    console.log('[ReminderJob] Complete')
  } catch (error) {
    console.error('[ReminderJob] Error:', error)
  }
}
