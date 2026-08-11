import { env, hasEvolutionProviderConfig } from '@/src/lib/config/env'

export type EvolutionInboundMessage = {
  messageId: string
  from: string
  body: string
  profileName?: string
  instance?: string
  remoteJid: string
}

type SendEvolutionTextInput = {
  to: string
  message: string
}

type SendEvolutionTextResult = {
  sent: boolean
  providerMessageId?: string
  reason?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const asString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const asNumberishString = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }

  return asString(value)
}

/** Strip WhatsApp JID / formatting to a digits-only phone when possible. */
export const normalizeEvolutionPhone = (value: string) => {
  const withoutJid = value.split('@')[0]?.trim() || ''
  const withoutPrefix = withoutJid.replace(/^whatsapp:/i, '').replace(/^\+/, '').replace(/\s+/g, '')
  return withoutPrefix
}

const extractTextFromMessage = (message: unknown): string | undefined => {
  if (!isRecord(message)) {
    return undefined
  }

  const conversation = asString(message.conversation)
  if (conversation) {
    return conversation
  }

  const extended = message.extendedTextMessage
  if (isRecord(extended)) {
    const text = asString(extended.text)
    if (text) {
      return text
    }
  }

  const ephemeral = message.ephemeralMessage
  if (isRecord(ephemeral) && isRecord(ephemeral.message)) {
    return extractTextFromMessage(ephemeral.message)
  }

  const viewOnce = message.viewOnceMessage || message.viewOnceMessageV2
  if (isRecord(viewOnce) && isRecord(viewOnce.message)) {
    return extractTextFromMessage(viewOnce.message)
  }

  return undefined
}

const normalizeEventName = (event: string | undefined) =>
  (event || '').trim().toLowerCase().replace(/_/g, '.')

const isMessagesUpsertEvent = (event: string | undefined) => {
  const normalized = normalizeEventName(event)
  return !event || normalized === 'messages.upsert' || normalized === 'messages.set'
}

const parseSingleMessageData = (data: Record<string, unknown>, instance?: string): EvolutionInboundMessage | null => {
  const key = isRecord(data.key) ? data.key : undefined
  if (!key) {
    return null
  }

  if (key.fromMe === true) {
    return null
  }

  const remoteJid = asString(key.remoteJid) || asString(key.remoteJidAlt)
  if (!remoteJid) {
    return null
  }

  // Ignore group / broadcast / status JIDs for the ERP agent harness.
  if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast') || remoteJid.endsWith('status@broadcast')) {
    return null
  }

  const messageId = asString(key.id)
  if (!messageId) {
    return null
  }

  const body =
    extractTextFromMessage(data.message) ||
    asString(data.text) ||
    (isRecord(data.message) ? asString(data.message.caption) : undefined)

  if (!body) {
    return null
  }

  const from =
    normalizeEvolutionPhone(remoteJid) ||
    normalizeEvolutionPhone(asString(data.sender) || '') ||
    normalizeEvolutionPhone(asNumberishString(data.participant) || '')

  if (!from) {
    return null
  }

  return {
    messageId,
    from,
    body,
    profileName: asString(data.pushName) || asString(data.pushname),
    instance,
    remoteJid
  }
}

/**
 * Parse Evolution API webhook payloads (v1/v2 messages.upsert variants).
 * Accepts `data` as object or array; ignores non-text / fromMe / group messages.
 */
export const parseEvolutionWebhookPayload = (payload: unknown): EvolutionInboundMessage[] => {
  if (!isRecord(payload)) {
    return []
  }

  const event = asString(payload.event) || asString(payload.type)
  if (!isMessagesUpsertEvent(event)) {
    return []
  }

  const instance = asString(payload.instance)
  const data = payload.data

  const items: Record<string, unknown>[] = []
  if (Array.isArray(data)) {
    for (const item of data) {
      if (isRecord(item)) {
        items.push(item)
      }
    }
  } else if (isRecord(data)) {
    // Some deployments nest messages under data.messages
    if (Array.isArray(data.messages)) {
      for (const item of data.messages) {
        if (isRecord(item)) {
          items.push(item)
        }
      }
    } else {
      items.push(data)
    }
  } else if (isRecord(payload.key) && (payload.message || payload.pushName)) {
    // Bare Baileys-style message object at root
    items.push(payload)
  }

  const parsed: EvolutionInboundMessage[] = []
  for (const item of items) {
    const inbound = parseSingleMessageData(item, instance)
    if (inbound) {
      parsed.push(inbound)
    }
  }

  return parsed
}

/**
 * Optional webhook secret. When EVOLUTION_WEBHOOK_SECRET is set, require a match
 * against `x-evolution-secret`, `x-webhook-secret`, `apikey` header, or body.apikey.
 */
export const isValidEvolutionWebhookSecret = (input: {
  headers: Headers
  bodyApikey?: string
}) => {
  const secret = env.evolutionWebhookSecret
  if (!secret) {
    return true
  }

  const candidates = [
    input.headers.get('x-evolution-secret'),
    input.headers.get('x-webhook-secret'),
    input.headers.get('apikey'),
    input.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
    input.bodyApikey
  ]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))

  return candidates.includes(secret)
}

const evolutionSendTextUrl = () => {
  const base = env.evolutionApiUrl?.replace(/\/+$/, '') || ''
  const instance = encodeURIComponent(env.evolutionInstance || '')
  return `${base}/message/sendText/${instance}`
}

export const sendEvolutionTextMessage = async ({
  to,
  message
}: SendEvolutionTextInput): Promise<SendEvolutionTextResult> => {
  if (!hasEvolutionProviderConfig) {
    return { sent: false, reason: 'Evolution provider not configured' }
  }

  const number = normalizeEvolutionPhone(to)
  if (!number) {
    return { sent: false, reason: 'Invalid destination phone' }
  }

  const response = await fetch(evolutionSendTextUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.evolutionApiKey || ''
    },
    body: JSON.stringify({
      number,
      text: message
    })
  })

  if (!response.ok) {
    const body = await response.text()
    return { sent: false, reason: `Evolution send failed (${response.status}): ${body}` }
  }

  const data = (await response.json().catch(() => null)) as
    | { key?: { id?: string }; message?: { key?: { id?: string } } }
    | null

  return {
    sent: true,
    providerMessageId: data?.key?.id || data?.message?.key?.id
  }
}
