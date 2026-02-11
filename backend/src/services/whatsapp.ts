export async function sendWhatsApp(
  phone: string,
  message: string
): Promise<{ success: boolean }> {
  // In development, log the WhatsApp message details instead of sending
  console.log('--- WHATSAPP STUB ---')
  console.log(`Phone: ${phone}`)
  console.log(`Message: ${message}`)
  console.log('--- END WHATSAPP ---')

  return { success: true }
}
