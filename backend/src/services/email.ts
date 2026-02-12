export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId: string }> {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'ap-south-1'
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@abcca.com'

  if (!accessKeyId || !secretAccessKey) {
    console.warn('[Email] AWS credentials not configured. Skipping send.')
    console.warn(`[Email] Would have sent to: ${to}, subject: "${subject}"`)
    return { success: false, messageId: '' }
  }

  try {
    const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses')

    const client = new SESClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })

    const result = await client.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: body, Charset: 'UTF-8' },
          },
        },
      })
    )

    const messageId = result.MessageId || `ses-${Date.now()}`
    console.log(`[Email] Sent to ${to}, messageId: ${messageId}`)
    return { success: true, messageId }
  } catch (error) {
    console.error('[Email] Failed to send:', error)
    return { success: false, messageId: '' }
  }
}
