import { hasEvolutionProviderConfig } from '@/src/lib/config/env'
import { runCrmAgent } from '@/src/lib/crm/agent/orchestrator'
import { normalizeEvolutionWebhookMessage } from '@/src/lib/crm/channel-normalizer'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { pushConversationAudit } from '@/src/lib/crm/audit-log'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { appLog } from '@/src/lib/observability/app-logger'
import { markEventProcessed, wasEventProcessed } from '@/src/lib/security/idempotency'
import { consumeRateLimit } from '@/src/lib/security/rate-limit'
import {
  isValidEvolutionWebhookSecret,
  parseEvolutionWebhookPayload,
  sendEvolutionTextMessage
} from '@/src/lib/whatsapp/evolution'

/**
 * Evolution API WhatsApp webhook (primary channel for DavinciAi).
 * Configure in Evolution → Instance → Webhook:
 *   POST https://<your-host>/api/whatsapp/evolution/webhook
 * Events: MESSAGES_UPSERT (webhook_by_events=false recommended)
 *
 * Production example:
 *   https://2x3crmtest.vercel.app/api/whatsapp/evolution/webhook
 */
export async function POST(request: Request) {
  const rawBody = await request.text()

  let body: unknown
  try {
    body = JSON.parse(rawBody) as unknown
  } catch {
    return jsonError('Invalid JSON payload', 400)
  }

  const bodyApikey =
    body && typeof body === 'object' && !Array.isArray(body) && 'apikey' in body
      ? typeof (body as { apikey?: unknown }).apikey === 'string'
        ? (body as { apikey: string }).apikey
        : undefined
      : undefined

  if (
    !isValidEvolutionWebhookSecret({
      headers: request.headers,
      bodyApikey
    })
  ) {
    return jsonError('Invalid Evolution webhook secret', 401)
  }

  if (!hasEvolutionProviderConfig) {
    return jsonError('Evolution provider is not configured', 503)
  }

  try {
    const messages = parseEvolutionWebhookPayload(body)

    for (const inboundRaw of messages) {
      const inbound = normalizeEvolutionWebhookMessage(inboundRaw)

      if (await wasEventProcessed(inbound.sourceMessageId)) {
        continue
      }

      await markEventProcessed(inbound.sourceMessageId)

      const rate = consumeRateLimit(`wa-evolution:${inbound.sourcePhone}`, 40, 60_000)
      if (!rate.allowed) {
        await sendEvolutionTextMessage({
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
          provider: 'evolution',
          intent: reply.intent,
          runMode: reply.runMode,
          handoffRequired: Boolean(reply.handoff?.required)
        }
      })

      const outbound = await sendEvolutionTextMessage({
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
            provider: 'evolution',
            reason: outbound.reason
          }
        })
        appLog('warn', 'Evolution outbound send failed', {
          reason: outbound.reason,
          sourcePhone: inbound.sourcePhone
        })
      }
    }

    return jsonOk({ success: true, received: true, processed: messages.length })
  } catch (error) {
    appLog('error', 'Evolution webhook processing error', {
      reason: error instanceof Error ? error.message : 'unknown error'
    })
    return jsonError('Webhook payload invalid', 400)
  }
}
