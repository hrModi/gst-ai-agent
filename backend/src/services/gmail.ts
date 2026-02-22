import { google } from 'googleapis'
import { getAuthClientForTenant } from './google-sheets'

export { getAuthClientForTenant }

/**
 * Poll Gmail for new GSTR1-DATA messages since lastPollAt.
 * Uses Gmail API on the authenticated tenant account (userId: 'me').
 * Returns a list of message IDs matching the query.
 */
export async function pollNewMessages(
  tenantId: string,
  lastPollAt: Date | null
): Promise<string[]> {
  const auth = await getAuthClientForTenant(tenantId)
  const gmail = google.gmail({ version: 'v1', auth })

  // Build query — only look at subject-matching emails so unrelated inbox mail is untouched
  let q = 'subject:GSTR1-DATA OR subject:PURCHASE-DATA'
  if (lastPollAt) {
    // Gmail 'after' uses Unix timestamp (seconds)
    const unixTs = Math.floor(lastPollAt.getTime() / 1000)
    q += ` after:${unixTs}`
  }

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: 50,
  })

  return (listRes.data.messages || []).map((m) => m.id!)
}

export interface ParsedMessage {
  messageId: string
  fromEmail: string
  subject: string
  receivedAt: Date
  parts: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }>
}

/**
 * Fetch a single Gmail message and extract header fields + attachment metadata.
 */
export async function fetchMessage(tenantId: string, messageId: string): Promise<ParsedMessage> {
  const auth = await getAuthClientForTenant(tenantId)
  const gmail = google.gmail({ version: 'v1', auth })

  const msgRes = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const msg = msgRes.data
  const headers = msg.payload?.headers || []

  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

  const fromEmail = getHeader('From')
  const subject = getHeader('Subject')
  const dateStr = getHeader('Date')
  const receivedAt = dateStr ? new Date(dateStr) : new Date()

  // Collect attachment parts
  const parts: ParsedMessage['parts'] = []
  const collectParts = (partList: any[]) => {
    for (const part of partList) {
      if (part.filename && part.body?.attachmentId) {
        parts.push({
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          attachmentId: part.body.attachmentId,
          size: part.body.size || 0,
        })
      }
      if (part.parts) collectParts(part.parts)
    }
  }

  if (msg.payload?.parts) collectParts(msg.payload.parts)

  return { messageId, fromEmail, subject, receivedAt, parts }
}

/**
 * Download a specific attachment from a Gmail message. Returns the file as a Buffer.
 */
export async function downloadAttachment(
  tenantId: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const auth = await getAuthClientForTenant(tenantId)
  const gmail = google.gmail({ version: 'v1', auth })

  const attRes = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  })

  // Gmail encodes attachment data as URL-safe base64
  const b64 = (attRes.data.data || '').replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}

/**
 * Parse a GSTR1-DATA or PURCHASE-DATA email subject.
 * Expected formats:
 *   "GSTR1-DATA | {GSTIN} | {MM-YYYY}"
 *   "PURCHASE-DATA | {GSTIN} | {MM-YYYY}"
 * Returns null if the subject doesn't match either pattern.
 */
export function parseSubject(
  subject: string
): { type: 'GSTR1' | 'PURCHASE'; gstin: string; month: number; year: number } | null {
  // Try GSTR1-DATA
  const gstr1Match = subject.match(/GSTR1-DATA\s*\|\s*([A-Z0-9]{15})\s*\|\s*(\d{2})-(\d{4})/i)
  if (gstr1Match) {
    const gstin = gstr1Match[1].toUpperCase()
    const month = parseInt(gstr1Match[2], 10)
    const year = parseInt(gstr1Match[3], 10)
    if (month < 1 || month > 12) return null
    return { type: 'GSTR1', gstin, month, year }
  }

  // Try PURCHASE-DATA
  const purchaseMatch = subject.match(/PURCHASE-DATA\s*\|\s*([A-Z0-9]{15})\s*\|\s*(\d{2})-(\d{4})/i)
  if (purchaseMatch) {
    const gstin = purchaseMatch[1].toUpperCase()
    const month = parseInt(purchaseMatch[2], 10)
    const year = parseInt(purchaseMatch[3], 10)
    if (month < 1 || month > 12) return null
    return { type: 'PURCHASE', gstin, month, year }
  }

  return null
}

// Backward-compatible helper for callers that only need GSTR1 check
export function parseGstr1Subject(subject: string): { gstin: string; month: number; year: number } | null {
  const result = parseSubject(subject)
  if (!result || result.type !== 'GSTR1') return null
  return { gstin: result.gstin, month: result.month, year: result.year }
}
