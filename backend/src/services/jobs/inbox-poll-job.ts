/**
 * inbox-poll-job.ts — Polls Gmail inboxes for GSTR1-DATA emails every 5 minutes.
 *
 * Flow per tenant (where gmailEnabled = true):
 *  1. Poll Gmail for messages with subject:GSTR1-DATA since lastPollAt
 *  2. Parse subject to extract GSTIN, month, year
 *  3. Match GSTIN to a client in DB
 *  4. If matched → download attachment → run pipeline → create/update InboxMessage
 *  5. If not matched → log YakshActivity ERROR → skip (do NOT create InboxMessage)
 *  6. Update gmailLastPollAt to now
 */
import { prisma } from '../../lib/prisma'
import { pollNewMessages, fetchMessage, downloadAttachment, parseSubject } from '../gmail'
import { processClientData, processPurchaseData } from '../pipeline'

export async function runInboxPollJob(): Promise<void> {
  console.log('[InboxPoll] Starting inbox poll job...')

  // Find all tenants with Gmail enabled
  const configs = await prisma.sheetSyncConfig.findMany({
    where: { gmailEnabled: true },
  })

  if (configs.length === 0) {
    console.log('[InboxPoll] No tenants with Gmail enabled. Skipping.')
    return
  }

  for (const config of configs) {
    const { tenantId, gmailLastPollAt } = config
    console.log(`[InboxPoll] Polling tenant ${tenantId} (last poll: ${gmailLastPollAt?.toISOString() ?? 'never'})`)

    try {
      const messageIds = await pollNewMessages(tenantId, gmailLastPollAt)
      console.log(`[InboxPoll] Tenant ${tenantId}: ${messageIds.length} new message(s)`)

      for (const messageId of messageIds) {
        await processInboxMessage(tenantId, messageId)
      }

      // Update last poll timestamp regardless of per-message failures
      await prisma.sheetSyncConfig.update({
        where: { tenantId },
        data: { gmailLastPollAt: new Date() },
      })
    } catch (err: any) {
      console.error(`[InboxPoll] Error polling tenant ${tenantId}:`, err.message)
      await prisma.yakshActivity.create({
        data: {
          tenantId,
          activityType: 'ERROR',
          description: `Gmail poll failed: ${err.message || 'Unknown error'}`,
        },
      }).catch(console.error)
    }
  }

  console.log('[InboxPoll] Done.')
}

async function processInboxMessage(tenantId: string, messageId: string): Promise<void> {
  // Skip already-processed messages (unique constraint on gmailMessageId)
  const existing = await prisma.inboxMessage.findUnique({ where: { gmailMessageId: messageId } })
  if (existing) {
    console.log(`[InboxPoll] Message ${messageId} already processed. Skipping.`)
    return
  }

  try {
    // 1. Fetch message metadata
    const parsed = await fetchMessage(tenantId, messageId)
    const { fromEmail, subject, receivedAt, parts } = parsed

    // 2. Parse subject — must match GSTR1-DATA | {GSTIN} | {MM-YYYY} or PURCHASE-DATA | {GSTIN} | {MM-YYYY}
    const subjectData = parseSubject(subject)
    if (!subjectData) {
      // Subject has keyword but not the right format — log and skip
      console.log(`[InboxPoll] Message ${messageId}: Subject "${subject}" doesn't match expected format. Skipping.`)
      return
    }

    const { type: dataType, gstin, month, year } = subjectData

    // 3. Find matching client by GSTIN + tenantId
    const client = await prisma.client.findFirst({
      where: { gstin: gstin.toUpperCase(), tenantId },
    })

    if (!client) {
      console.log(`[InboxPoll] Message ${messageId}: Unrecognised GSTIN "${gstin}" for tenant ${tenantId}`)
      await prisma.yakshActivity.create({
        data: {
          tenantId,
          activityType: 'ERROR',
          description: `Unrecognised GSTIN in email: ${gstin} (subject: "${subject}", from: ${fromEmail})`,
          metadata: { messageId, gstin, subject, fromEmail } as any,
        },
      }).catch(console.error)
      return
    }

    // 4. Find attachment (prefer XLSX, then CSV, then first)
    const attachment = parts.find(p =>
      p.filename.endsWith('.xlsx') || p.filename.endsWith('.xls') || p.filename.endsWith('.csv')
    ) || parts[0]

    if (!attachment) {
      console.log(`[InboxPoll] Message ${messageId}: No attachment found. Skipping.`)
      await prisma.yakshActivity.create({
        data: {
          tenantId,
          clientId: client.id,
          activityType: 'ERROR',
          description: `Email from ${fromEmail} for ${gstin} has no attachment`,
          metadata: { messageId, subject } as any,
        },
      }).catch(console.error)
      return
    }

    // 5. Create InboxMessage with PROCESSING status
    const inboxMsg = await prisma.inboxMessage.create({
      data: {
        tenantId,
        clientId: client.id,
        gmailMessageId: messageId,
        fromEmail,
        subject,
        receivedAt,
        month,
        year,
        attachmentCount: parts.length,
        status: 'PROCESSING',
        pipelineStage: 'DATA_RECEIVED',
        dataType,
      },
    })

    console.log(`[InboxPoll] Created InboxMessage ${inboxMsg.id} for client ${client.id} (${gstin} ${month}/${year} type=${dataType})`)

    // 6. Download attachment
    const fileBuffer = await downloadAttachment(tenantId, messageId, attachment.attachmentId)

    // 7. Route to appropriate pipeline based on data type
    if (dataType === 'PURCHASE') {
      await processPurchaseData(
        client.id,
        month,
        year,
        fileBuffer,
        attachment.filename,
        'EMAIL',
        tenantId,
        inboxMsg.id
      )
    } else {
      await processClientData(
        client.id,
        month,
        year,
        fileBuffer,
        attachment.filename,
        'EMAIL',
        tenantId,
        inboxMsg.id
      )
    }

    console.log(`[InboxPoll] Pipeline complete for InboxMessage ${inboxMsg.id}`)
  } catch (err: any) {
    console.error(`[InboxPoll] Error processing message ${messageId}:`, err.message)

    // Attempt to mark InboxMessage as FAILED if it was created
    const inboxMsg = await prisma.inboxMessage.findUnique({ where: { gmailMessageId: messageId } }).catch(() => null)
    if (inboxMsg && inboxMsg.status === 'PROCESSING') {
      await prisma.inboxMessage.update({
        where: { id: inboxMsg.id },
        data: { status: 'FAILED', errorSummary: err.message || 'Unknown error' },
      }).catch(console.error)
    }

    await prisma.yakshActivity.create({
      data: {
        tenantId,
        activityType: 'ERROR',
        description: `Inbox pipeline error for message ${messageId}: ${err.message || 'Unknown error'}`,
        metadata: { messageId } as any,
      },
    }).catch(console.error)
  }
}
