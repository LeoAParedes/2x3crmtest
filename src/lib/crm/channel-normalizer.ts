import { crmNormalizedMessageSchema, type CrmNormalizedMessage, type WebChatPayload } from '@/src/lib/crm/channel-schema'
import { metaWebhookPayloadSchema, type MetaWebhookPayload } from '@/src/lib/crm/whatsapp-meta-schema'
import {
  normalizeEvolutionPhone,
  type EvolutionInboundMessage
} from '@/src/lib/whatsapp/evolution'
import {
  normalizeTwilioWhatsAppPhone,
  type TwilioInboundMessage
} from '@/src/lib/whatsapp/twilio'

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

export const normalizeTwilioWebhookMessage = (inbound: TwilioInboundMessage): NormalizedWhatsAppInbound => {
  const sourcePhone = normalizeTwilioWhatsAppPhone(inbound.from)
  const sessionId = `wa-twilio-${sourcePhone}`

  const normalizedMessage = crmNormalizedMessageSchema.parse({
    channel: 'whatsapp',
    customerId: sourcePhone,
    sessionId,
    message: inbound.body,
    locale: 'es-MX',
    metadata: {
      sourceMessageId: inbound.messageSid,
      customerPhone: sourcePhone,
      customerName: inbound.profileName,
      rawPayload: {
        provider: 'twilio',
        to: inbound.to
      }
    }
  })

  return {
    message: normalizedMessage,
    sourceMessageId: inbound.messageSid,
    sourcePhone,
    sourceProfileName: inbound.profileName
  }
}

export const normalizeEvolutionWebhookMessage = (
  inbound: EvolutionInboundMessage
): NormalizedWhatsAppInbound => {
  const sourcePhone = normalizeEvolutionPhone(inbound.from)
  const sessionId = `wa-evolution-${sourcePhone}`

  const normalizedMessage = crmNormalizedMessageSchema.parse({
    channel: 'whatsapp',
    customerId: sourcePhone,
    sessionId,
    message: inbound.body,
    locale: 'es-MX',
    metadata: {
      sourceMessageId: inbound.messageId,
      customerPhone: sourcePhone,
      customerName: inbound.profileName,
      rawPayload: {
        provider: 'evolution',
        instance: inbound.instance,
        remoteJid: inbound.remoteJid
      }
    }
  })

  return {
    message: normalizedMessage,
    sourceMessageId: inbound.messageId,
    sourcePhone,
    sourceProfileName: inbound.profileName
  }
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
