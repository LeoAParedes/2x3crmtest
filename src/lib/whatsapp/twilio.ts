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

const signatureDigestForUrl = (authToken: string, url: string, params: URLSearchParams) => {
  const sortedKeys = [...params.keys()].sort()
  let data = url
  for (const key of sortedKeys) {
    data += key + (params.get(key) || '')
  }
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64')
}

const signaturesMatch = (expectedBase64: string, provided: string) => {
  const expected = Buffer.from(expectedBase64)
  const providedBuf = Buffer.from(provided)
  if (expected.length !== providedBuf.length) return false
  return timingSafeEqual(expected, providedBuf)
}

/**
 * Twilio signs the exact webhook URL configured in Console.
 * On Vercel, `request.url` can differ from that public URL (proto/host),
 * so we validate against a small set of candidates.
 */
export const resolveTwilioWebhookUrlCandidates = (request: Request): string[] => {
  const incoming = new URL(request.url)
  const pathWithSearch = `${incoming.pathname}${incoming.search}`
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const hostHeader = request.headers.get('host')?.split(',')[0]?.trim()
  const host = forwardedHost || hostHeader || incoming.host

  const candidates = new Set<string>()
  candidates.add(request.url)
  candidates.add(incoming.toString())

  if (host) {
    if (forwardedProto) {
      candidates.add(`${forwardedProto}://${host}${pathWithSearch}`)
    }
    candidates.add(`https://${host}${pathWithSearch}`)
  }

  const base = env.appBaseUrl.replace(/\/$/, '')
  if (base) {
    candidates.add(`${base}${pathWithSearch}`)
  }

  return [...candidates]
}

/**
 * Validate Twilio request signature when TWILIO_AUTH_TOKEN is configured.
 * Docs: https://www.twilio.com/docs/usage/security#validating-requests
 */
export const isValidTwilioSignature = (input: {
  signature: string | null
  url: string
  params: URLSearchParams
  /** Optional extra URLs (e.g. from forwarded headers / public base). */
  urlCandidates?: string[]
}) => {
  const authToken = env.twilioAuthToken
  if (!authToken) {
    // Allow local/demo wiring without signature when token is not set.
    return true
  }

  if (!input.signature) {
    return false
  }

  const urls = new Set<string>([input.url, ...(input.urlCandidates || [])])
  for (const url of urls) {
    if (!url) continue
    const digest = signatureDigestForUrl(authToken, url, input.params)
    if (signaturesMatch(digest, input.signature)) {
      return true
    }
  }

  return false
}

/** Debug helper: which candidate URL (if any) matched — never returns secrets. */
export const diagnoseTwilioSignature = (input: {
  signature: string | null
  urlCandidates: string[]
  params: URLSearchParams
}) => {
  const authTokenConfigured = Boolean(env.twilioAuthToken)
  if (!authTokenConfigured) {
    return {
      authTokenConfigured: false,
      signaturePresent: Boolean(input.signature),
      matchedUrl: null as string | null,
      candidateCount: input.urlCandidates.length
    }
  }

  if (!input.signature || !env.twilioAuthToken) {
    return {
      authTokenConfigured: true,
      signaturePresent: Boolean(input.signature),
      matchedUrl: null as string | null,
      candidateCount: input.urlCandidates.length
    }
  }

  for (const url of input.urlCandidates) {
    const digest = signatureDigestForUrl(env.twilioAuthToken, url, input.params)
    if (signaturesMatch(digest, input.signature)) {
      return {
        authTokenConfigured: true,
        signaturePresent: true,
        matchedUrl: url,
        candidateCount: input.urlCandidates.length
      }
    }
  }

  return {
    authTokenConfigured: true,
    signaturePresent: true,
    matchedUrl: null as string | null,
    candidateCount: input.urlCandidates.length
  }
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

/** Empty TwiML ack when the reply was already sent via REST API. */
export const buildTwilioEmptyTwiml = () =>
  `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

export const hasTwilioProviderConfig = Boolean(env.twilioAuthToken || env.twilioAccountSid)
