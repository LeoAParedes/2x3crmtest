import { env, hasMetaProviderConfig } from '@/src/lib/config/env'

type SendMetaMessageInput = {
  to: string
  message: string
}

type SendMetaMessageResult = {
  sent: boolean
  providerMessageId?: string
  reason?: string
}

const metaEndpoint = () => {
  return `https://graph.facebook.com/${env.metaApiVersion}/${env.metaPhoneNumberId}/messages`
}

export const sendMetaTextMessage = async ({ to, message }: SendMetaMessageInput): Promise<SendMetaMessageResult> => {
  if (!hasMetaProviderConfig) {
    return { sent: false, reason: 'Meta provider not configured' }
  }

  const response = await fetch(metaEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.metaAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    return { sent: false, reason: `Meta send failed (${response.status}): ${body}` }
  }

  const data = (await response.json()) as { messages?: Array<{ id: string }> }
  return { sent: true, providerMessageId: data.messages?.[0]?.id }
}
