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

  // Gupshup requires phone numbers without '+', with country code prefix (e.g. 919624214015)
  const normalizePhone = (p: string) => {
    const stripped = p.replace(/\D/g, '') // digits only
    if (stripped.startsWith('91') && stripped.length === 12) return stripped
    if (stripped.length === 10) return `91${stripped}` // Indian number without country code
    return stripped
  }
  const sourcePhone = normalizePhone(process.env.GUPSHUP_PHONE_NUMBER || '')
  const destPhone = normalizePhone(phone)

  const payload = {
    channel: 'whatsapp',
    source: sourcePhone,
    destination: destPhone,
    message: JSON.stringify({ type: 'text', text: message }),
    'src.name': process.env.GUPSHUP_APP_NAME || '',
  }

  try {
    const response = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(payload),
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

export async function sendWhatsAppTemplate(
  phone: string,
  elementName: string,
  params: string[]
): Promise<{ success: boolean }> {
  const apiKey = process.env.GUPSHUP_API_KEY

  if (!apiKey) {
    console.warn('[WhatsApp] GUPSHUP_API_KEY not configured. Skipping template send.')
    return { success: false }
  }

  const normalizePhone = (p: string) => {
    const stripped = p.replace(/\D/g, '')
    if (stripped.startsWith('91') && stripped.length === 12) return stripped
    if (stripped.length === 10) return `91${stripped}`
    return stripped
  }
  const sourcePhone = normalizePhone(process.env.GUPSHUP_PHONE_NUMBER || '')
  const destPhone = normalizePhone(phone)

  const payload = {
    channel: 'whatsapp',
    source: sourcePhone,
    destination: destPhone,
    message: JSON.stringify({
      type: 'template',
      template: {
        id: elementName,
        params,
      },
    }),
    'src.name': process.env.GUPSHUP_APP_NAME || '',
  }

  try {
    const response = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[WhatsApp] Gupshup template error ${response.status}:`, errorText)
      return { success: false }
    }

    console.log(`[WhatsApp] Template "${elementName}" sent to ${phone}`)
    return { success: true }
  } catch (error) {
    console.error('[WhatsApp] Failed to send template:', error)
    return { success: false }
  }
}
