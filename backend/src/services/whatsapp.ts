export async function sendWhatsApp(
  phone: string,
  message: string
): Promise<{ success: boolean }> {
  const apiKey = process.env.GUPSHUP_API_KEY

  if (!apiKey) {
    console.warn('[WhatsApp] GUPSHUP_API_KEY not configured. Skipping send.')
    console.warn(`[WhatsApp] Would have sent to: ${phone}, message: "${message}"`)
    return { success: false }
  }

  try {
    const response = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.GUPSHUP_PHONE_NUMBER || '',
        destination: phone,
        message: JSON.stringify({ type: 'text', text: message }),
        'src.name': 'ABCCAAssociates',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[WhatsApp] Gupshup error ${response.status}:`, errorText)
      return { success: false }
    }

    console.log(`[WhatsApp] Sent to ${phone}`)
    return { success: true }
  } catch (error) {
    console.error('[WhatsApp] Failed to send:', error)
    return { success: false }
  }
}
