export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId: string }> {
  const apiKey = process.env.SENDGRID_API_KEY

  if (!apiKey) {
    console.warn('[Email] SENDGRID_API_KEY not configured. Skipping send.')
    console.warn(`[Email] Would have sent to: ${to}, subject: "${subject}"`)
    return { success: false, messageId: '' }
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || 'noreply@abcca.com' },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Email] SendGrid error ${response.status}:`, errorText)
      return { success: false, messageId: '' }
    }

    const messageId = response.headers.get('x-message-id') || `sg-${Date.now()}`
    console.log(`[Email] Sent to ${to}, messageId: ${messageId}`)
    return { success: true, messageId }
  } catch (error) {
    console.error('[Email] Failed to send:', error)
    return { success: false, messageId: '' }
  }
}
