import { crmNormalizedMessageSchema, type CrmNormalizedMessage, type WebChatPayload } from '@/src/lib/crm/channel-schema'
import { metaWebhookPayloadSchema, type MetaWebhookPayload } from '@/src/lib/crm/whatsapp-meta-schema'

export const normalizeWebChatPayload = (payload: WebChatPayload): CrmNormalizedMessage => {
  return crmNormalizedMessageSchema.parse({
    channel: 'web',
    customerId: payload.customerId,
    sessionId: payload.sessionId,
    message: payload.message,
    locale: payload.locale || 'es-MX',
    metadata: payload.metadata || {}
  })
}

export type NormalizedWhatsAppInbound = {
  message: CrmNormalizedMessage
  sourceMessageId: string
  sourcePhone: string
  sourceProfileName?: string
}

export const normalizeMetaWebhookPayload = (payload: MetaWebhookPayload): NormalizedWhatsAppInbound[] => {
  const parsed = metaWebhookPayloadSchema.parse(payload)
  const normalized: NormalizedWhatsAppInbound[] = []

  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      const contactsByWaId = new Map<string, string | undefined>()
      for (const contact of change.value.contacts || []) {
        contactsByWaId.set(contact.wa_id, contact.profile?.name)
      }

      for (const incomingMessage of change.value.messages || []) {
        if (!incomingMessage.text?.body) {
          continue
        }

        const sessionId = `wa-${incomingMessage.from}`
        const sourceProfileName = contactsByWaId.get(incomingMessage.from)
        const normalizedMessage = crmNormalizedMessageSchema.parse({
          channel: 'whatsapp',
          customerId: incomingMessage.from,
          sessionId,
          message: incomingMessage.text.body,
          locale: 'es-MX',
          metadata: {
            sourceMessageId: incomingMessage.id,
            sourceEventId: entry.id,
            customerPhone: incomingMessage.from,
            customerName: sourceProfileName,
            rawPayload: {
              type: incomingMessage.type,
              timestamp: incomingMessage.timestamp
            }
          }
        })

        normalized.push({
          message: normalizedMessage,
          sourceMessageId: incomingMessage.id,
          sourcePhone: incomingMessage.from,
          sourceProfileName
        })
      }
    }
  }

  return normalized
}
