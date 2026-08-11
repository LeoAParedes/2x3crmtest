import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '@/src/lib/config/env'

export type TwilioInboundMessage = {
  messageSid: string
  from: string
  to: string
  body: string
  profileName?: string
}

const readFormValue = (params: URLSearchParams, key: string) => {
  const value = params.get(key)?.trim()
  return value || undefined
}

export const parseTwilioWebhookForm = (form: URLSearchParams): TwilioInboundMessage | null => {
  const messageSid = readFormValue(form, 'MessageSid') || readFormValue(form, 'SmsSid')
  const from = readFormValue(form, 'From')
  const to = readFormValue(form, 'To')
  const body = readFormValue(form, 'Body')

  if (!messageSid || !from || !body) {
    return null
  }

  return {
    messageSid,
    from,
    to: to || '',
    body,
    profileName: readFormValue(form, 'ProfileName')
  }
}

/** Twilio WhatsApp phones look like `whatsapp:+521...`. */
export const normalizeTwilioWhatsAppPhone = (value: string) =>
  value.replace(/^whatsapp:/i, '').replace(/\s+/g, '').trim()

/**
 * Validate Twilio request signature when TWILIO_AUTH_TOKEN is configured.
 * Docs: https://www.twilio.com/docs/usage/security#validating-requests
 */
export const isValidTwilioSignature = (input: {
  signature: string | null
  url: string
  params: URLSearchParams
}) => {
  const authToken = env.twilioAuthToken
  if (!authToken) {
    // Allow local/demo wiring without signature when token is not set.
    return true
  }

  if (!input.signature) {
    return false
  }

  const sortedKeys = [...input.params.keys()].sort()
  let data = input.url
  for (const key of sortedKeys) {
    data += key + (input.params.get(key) || '')
  }

  const digest = createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64')
  const expected = Buffer.from(digest)
  const provided = Buffer.from(input.signature)

  if (expected.length !== provided.length) {
    return false
  }

  return timingSafeEqual(expected, provided)
}

export const buildTwilioMessagingTwiml = (message: string) => {
  const escaped = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`
}

export const hasTwilioProviderConfig = Boolean(env.twilioAuthToken || env.twilioAccountSid)
