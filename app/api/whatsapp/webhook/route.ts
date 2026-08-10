import { env, hasMetaProviderConfig } from '@/src/lib/config/env'
import { runCrmAgent } from '@/src/lib/crm/agent/orchestrator'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { normalizeMetaWebhookPayload } from '@/src/lib/crm/channel-normalizer'
import { pushConversationAudit } from '@/src/lib/crm/audit-log'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { appLog } from '@/src/lib/observability/app-logger'
import { markEventProcessed, wasEventProcessed } from '@/src/lib/security/idempotency'
import { consumeRateLimit } from '@/src/lib/security/rate-limit'
import { sendMetaTextMessage } from '@/src/lib/whatsapp/meta-client'
import { isValidMetaSignature } from '@/src/lib/whatsapp/meta-signature'

const challengeModeKey = 'hub.mode'
const challengeTokenKey = 'hub.verify_token'
const challengeResponseKey = 'hub.challenge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get(challengeModeKey)
  const token = searchParams.get(challengeTokenKey)
  const challenge = searchParams.get(challengeResponseKey)

  if (mode === 'subscribe' && token && env.metaWebhookVerifyToken && token === env.metaWebhookVerifyToken) {
    return new Response(challenge || '', { status: 200 })
  }

  return jsonError('Webhook verification failed', 403)
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-hub-signature-256')

  if (!isValidMetaSignature(rawBody, signatureHeader)) {
    return jsonError('Invalid webhook signature', 401)
  }

  if (!hasMetaProviderConfig) {
    return jsonError('Meta provider is not configured', 503)
  }

  try {
    const body = JSON.parse(rawBody) as unknown
    const messages = normalizeMetaWebhookPayload(body as never)

    for (const inbound of messages) {
      if (await wasEventProcessed(inbound.sourceMessageId)) {
        continue
      }

      await markEventProcessed(inbound.sourceMessageId)

      const rate = consumeRateLimit(`wa:${inbound.sourcePhone}`, 40, 60_000)
      if (!rate.allowed) {
        await sendMetaTextMessage({
          to: inbound.sourcePhone,
          message: 'Hemos recibido muchos mensajes seguidos. Intenta nuevamente en un minuto.'
        })
        continue
      }

      const reply = await runCrmAgent(inbound.message)
      await pushConversationAudit(inbound.message, reply)
      await safeRecordAgentAction({
        actionType: 'agent.reply.generated',
        status: 'success',
        actorType: 'agent',
        channel: 'whatsapp',
        sessionId: inbound.message.sessionId,
        customerId: inbound.message.customerId,
        metadata: {
          intent: reply.intent,
          runMode: reply.runMode,
          handoffRequired: Boolean(reply.handoff?.required)
        }
      })

      const outbound = await sendMetaTextMessage({
        to: inbound.sourcePhone,
        message: reply.reply
      })

      if (!outbound.sent) {
        await safeRecordAgentAction({
          actionType: 'whatsapp.outbound.failed',
          status: 'failed',
          actorType: 'system',
          channel: 'whatsapp',
          sessionId: inbound.message.sessionId,
          customerId: inbound.message.customerId,
          metadata: {
            reason: outbound.reason
          }
        })
        appLog('warn', 'Meta outbound send failed', { reason: outbound.reason, sourcePhone: inbound.sourcePhone })
      }
    }

    return jsonOk({ success: true, received: true })
  } catch (error) {
    appLog('error', 'Meta webhook processing error', {
      reason: error instanceof Error ? error.message : 'unknown error'
    })
    return jsonError('Webhook payload invalid', 400)
  }
}
