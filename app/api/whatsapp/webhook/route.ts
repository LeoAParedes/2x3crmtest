import { env, hasMetaProviderConfig } from '@/src/lib/config/env'
import { runCrmAgent } from '@/src/lib/crm/agent/orchestrator'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { normalizeMetaWebhookPayload } from '@/src/lib/crm/channel-normalizer'
import { pushConversationAudit } from '@/src/lib/crm/audit-log'
import { getMastraSettings } from '@/src/lib/crm/mastra-settings'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { appLog } from '@/src/lib/observability/app-logger'
import { markEventProcessed, wasEventProcessed } from '@/src/lib/security/idempotency'
import { consumeRateLimit } from '@/src/lib/security/rate-limit'
import { sendMetaTextMessage } from '@/src/lib/whatsapp/meta-client'
import { isValidMetaSignature } from '@/src/lib/whatsapp/meta-signature'
import { recordWebhookDebugHit } from '@/src/lib/whatsapp/webhook-debug-state'

const debugWebhookLog = (
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
) => {
  // #region agent log
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify({
      sessionId: '449600',
      runId: 'whatsapp-webhook',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion
  appLog('info', `[debug449600] ${message}`, { hypothesisId, ...data })
}

const challengeModeKey = 'hub.mode'
const challengeTokenKey = 'hub.verify_token'
const challengeResponseKey = 'hub.challenge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get(challengeModeKey)
  const token = searchParams.get(challengeTokenKey)
  const challenge = searchParams.get(challengeResponseKey)
  const configuredToken = env.metaWebhookVerifyToken
  const tokenMatches = Boolean(token && configuredToken && token === configuredToken)

  // #region agent log
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify({
      sessionId: '449600',
      runId: 'whatsapp-webhook',
      hypothesisId: 'G',
      location: 'webhook/route.ts:GET',
      message: 'Meta webhook verification challenge',
      data: {
        mode,
        hasToken: Boolean(token),
        hasConfiguredToken: Boolean(configuredToken),
        tokenMatches,
        hasChallenge: Boolean(challenge),
        tokenLength: token?.length || 0,
        configuredTokenLength: configuredToken?.length || 0
      },
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion
  appLog('info', '[debug449600] Meta webhook verification challenge', {
    mode,
    hasToken: Boolean(token),
    hasConfiguredToken: Boolean(configuredToken),
    tokenMatches,
    hasChallenge: Boolean(challenge),
    tokenLength: token?.length || 0,
    configuredTokenLength: configuredToken?.length || 0
  })
  recordWebhookDebugHit({
    stage: tokenMatches ? 'received' : 'error',
    reason: tokenMatches
      ? 'verify_ok'
      : !configuredToken
        ? 'verify_token_missing_in_env'
        : !token
          ? 'verify_token_missing_in_query'
          : 'verify_token_mismatch'
  })

  if (mode === 'subscribe' && tokenMatches) {
    return new Response(challenge || '', { status: 200 })
  }

  return jsonError('Webhook verification failed', 403)
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-hub-signature-256')

  debugWebhookLog('webhook/route.ts:POST', 'Meta webhook POST received', {
    bodyBytes: rawBody.length,
    hasSignatureHeader: Boolean(signatureHeader),
    hasMetaAppSecret: Boolean(env.metaAppSecret),
    hasMetaProviderConfig
  }, 'A')
  recordWebhookDebugHit({
    stage: 'received',
    hasSignatureHeader: Boolean(signatureHeader)
  })
  await safeRecordAgentAction({
    actionType: 'whatsapp.webhook.received',
    status: 'pending',
    actorType: 'system',
    channel: 'whatsapp',
    metadata: {
      bodyBytes: rawBody.length,
      hasSignatureHeader: Boolean(signatureHeader),
      hasMetaAppSecret: Boolean(env.metaAppSecret)
    }
  })

  const signatureValid = isValidMetaSignature(rawBody, signatureHeader)
  debugWebhookLog('webhook/route.ts:POST', 'Meta signature validation', {
    signatureValid,
    hasMetaAppSecret: Boolean(env.metaAppSecret)
  }, 'B')

  if (!signatureValid) {
    recordWebhookDebugHit({
      stage: 'signature_failed',
      signatureValid: false,
      hasSignatureHeader: Boolean(signatureHeader),
      reason: env.metaAppSecret ? 'signature_mismatch_or_bad_header' : 'meta_app_secret_missing'
    })
    await safeRecordAgentAction({
      actionType: 'whatsapp.webhook.signature_failed',
      status: 'failed',
      actorType: 'system',
      channel: 'whatsapp',
      metadata: {
        hasMetaAppSecret: Boolean(env.metaAppSecret),
        hasSignatureHeader: Boolean(signatureHeader)
      }
    })
    return jsonError('Invalid webhook signature', 401)
  }

  if (!hasMetaProviderConfig) {
    return jsonError('Meta provider is not configured', 503)
  }

  try {
    const body = JSON.parse(rawBody) as unknown
    const messages = normalizeMetaWebhookPayload(body as never)

    debugWebhookLog('webhook/route.ts:POST', 'Meta payload normalized', {
      messageCount: messages.length,
      firstMessageType: messages[0]?.message.message?.slice(0, 40) || null
    }, 'C')
    recordWebhookDebugHit({
      stage: 'normalized',
      signatureValid: true,
      messageCount: messages.length
    })

    const agentSettings = await getMastraSettings()
    debugWebhookLog('webhook/route.ts:POST', 'Agent settings loaded', {
      enabled: agentSettings.enabled,
      modelId: agentSettings.modelId,
      allowedErpToolsCount: agentSettings.allowedErpTools.length,
      hasOpenAiKey: Boolean(env.openAiApiKey)
    }, 'D')

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

      debugWebhookLog('webhook/route.ts:POST', 'Agent reply generated', {
        runMode: reply.runMode,
        intent: reply.intent,
        replyChars: reply.reply.length
      }, 'E')
      recordWebhookDebugHit({
        stage: 'agent_replied',
        signatureValid: true,
        messageCount: 1,
        runMode: reply.runMode,
        intent: reply.intent
      })

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

      debugWebhookLog('webhook/route.ts:POST', 'Meta outbound send result', {
        sent: outbound.sent,
        reason: outbound.reason || null,
        providerMessageId: outbound.providerMessageId || null
      }, 'F')
      recordWebhookDebugHit({
        stage: 'outbound',
        signatureValid: true,
        outboundSent: outbound.sent,
        runMode: reply.runMode,
        reason: outbound.reason
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
    const reason = error instanceof Error ? error.message : 'unknown error'
    recordWebhookDebugHit({ stage: 'error', signatureValid: true, reason })
    debugWebhookLog('webhook/route.ts:POST', 'Meta webhook processing error', { reason }, 'C')
    appLog('error', 'Meta webhook processing error', { reason })
    return jsonError('Webhook payload invalid', 400)
  }
}
