export type WebhookDebugHit = {
  at: string
  stage:
    | 'received'
    | 'signature_failed'
    | 'normalized'
    | 'agent_replied'
    | 'outbound'
    | 'error'
  signatureValid?: boolean
  hasSignatureHeader?: boolean
  messageCount?: number
  runMode?: string
  intent?: string
  outboundSent?: boolean
  reason?: string
}

const MAX_HITS = 12

let lastHit: WebhookDebugHit | null = null
const recentHits: WebhookDebugHit[] = []

export const recordWebhookDebugHit = (hit: Omit<WebhookDebugHit, 'at'> & { at?: string }) => {
  const entry: WebhookDebugHit = {
    ...hit,
    at: hit.at || new Date().toISOString()
  }
  lastHit = entry
  recentHits.unshift(entry)
  if (recentHits.length > MAX_HITS) {
    recentHits.length = MAX_HITS
  }
  return entry
}

export const getWebhookDebugState = () => ({
  lastHit,
  recentHits: [...recentHits]
})
