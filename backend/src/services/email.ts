export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId: string }> {
  // In development, log the email details instead of sending
  console.log('--- EMAIL STUB ---')
  console.log(`To: ${to}`)
  console.log(`Subject: ${subject}`)
  console.log(`Body: ${body}`)
  console.log('--- END EMAIL ---')

  const messageId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  return { success: true, messageId }
}
