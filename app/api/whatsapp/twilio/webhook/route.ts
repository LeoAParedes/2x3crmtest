import { runCrmAgent } from '@/src/lib/crm/agent/orchestrator'
import { normalizeTwilioWebhookMessage } from '@/src/lib/crm/channel-normalizer'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { pushConversationAudit } from '@/src/lib/crm/audit-log'
import { jsonError } from '@/src/lib/http/json-response'
import { appLog } from '@/src/lib/observability/app-logger'
import { markEventProcessed, wasEventProcessed } from '@/src/lib/security/idempotency'
import { consumeRateLimit } from '@/src/lib/security/rate-limit'
import {
  buildTwilioEmptyTwiml,
  buildTwilioMessagingTwiml,
  diagnoseTwilioSignature,
  isValidTwilioSignature,
  parseTwilioWebhookForm,
  resolveTwilioWebhookUrlCandidates
} from '@/src/lib/whatsapp/twilio'

export const maxDuration = 60

/**
 * Twilio WhatsApp webhook.
 * Configure in Twilio Console → WhatsApp Sender → "When a message comes in":
 *   POST https://<your-host>/api/whatsapp/twilio/webhook
 *
 * Replies through TwiML to let Twilio deliver with the inbound auth context.
 */
export async function POST(request: Request) {
  const startedAt = Date.now()
  const rawBody = await request.text()
  const params = new URLSearchParams(rawBody)
  const signature = request.headers.get('x-twilio-signature')
  const urlCandidates = resolveTwilioWebhookUrlCandidates(request)
  const diagnosis = diagnoseTwilioSignature({
    signature,
    urlCandidates,
    params
  })

  appLog('info', 'Twilio webhook signature check', {
    authTokenConfigured: diagnosis.authTokenConfigured,
    signaturePresent: diagnosis.signaturePresent,
    matchedUrl: diagnosis.matchedUrl,
    candidateCount: diagnosis.candidateCount,
    requestUrl: request.url
  })

  if (
    !isValidTwilioSignature({
      signature,
      url: request.url,
      urlCandidates,
      params
    })
  ) {
    appLog('error', 'Twilio webhook rejected: invalid signature', {
      authTokenConfigured: diagnosis.authTokenConfigured,
      signaturePresent: diagnosis.signaturePresent,
      candidateCount: diagnosis.candidateCount
    })
    return jsonError('Invalid Twilio signature', 401)
  }

  const inbound = parseTwilioWebhookForm(params)
  if (!inbound) {
    return jsonError('Invalid Twilio webhook payload', 400)
  }

  try {
    if (await wasEventProcessed(inbound.messageSid)) {
      appLog('info', 'Twilio webhook duplicate ignored', {
        messageSid: inbound.messageSid,
        elapsedMs: Date.now() - startedAt
      })
      return new Response(buildTwilioEmptyTwiml(), {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' }
      })
    }

    const normalized = normalizeTwilioWebhookMessage(inbound)
    const rate = consumeRateLimit(`wa-twilio:${normalized.sourcePhone}`, 40, 60_000)
    if (!rate.allowed) {
      return new Response(
        buildTwilioMessagingTwiml('Hemos recibido muchos mensajes seguidos. Intenta nuevamente en un minuto.'),
        {
          status: 200,
          headers: { 'Content-Type': 'text/xml; charset=utf-8' }
        }
      )
    }

    const reply = await runCrmAgent(normalized.message)
    const replyText = (reply.reply || '').trim() || 'No pude consultar la base de datos en este momento.'

    await pushConversationAudit(normalized.message, { ...reply, reply: replyText })
    await safeRecordAgentAction({
      actionType: 'agent.reply.generated',
      status: 'success',
      actorType: 'agent',
      channel: 'whatsapp',
      sessionId: normalized.message.sessionId,
      customerId: normalized.message.customerId,
      metadata: {
        provider: 'twilio',
        intent: reply.intent,
        runMode: reply.runMode,
        handoffRequired: Boolean(reply.handoff?.required),
        transport: 'twiml',
        elapsedMs: Date.now() - startedAt
      }
    })

    // Mark only after we attempted delivery, so Twilio retries can recover from crashes.
    await markEventProcessed(inbound.messageSid)

    appLog('info', 'Twilio webhook reply ready', {
      messageSid: inbound.messageSid,
      transport: 'twiml',
      intent: reply.intent,
      elapsedMs: Date.now() - startedAt
    })

    // #region agent log
    fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
      body: JSON.stringify({
        sessionId: '449600',
        runId: 'whatsapp-twilio',
        hypothesisId: 'H6',
        location: 'app/api/whatsapp/twilio/webhook/route.ts',
        message: 'twilio twiml reply prepared',
        data: {
          transport: 'twiml',
          intent: reply.intent,
          elapsedMs: Date.now() - startedAt,
          replyPreview: replyText.slice(0, 160)
        },
        timestamp: Date.now()
      })
    }).catch(() => {})
    // #endregion

    return new Response(buildTwilioMessagingTwiml(replyText), {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' }
    })
  } catch (error) {
    appLog('error', 'Twilio webhook processing error', {
      reason: error instanceof Error ? error.message : 'unknown error',
      elapsedMs: Date.now() - startedAt
    })
    return new Response(
      buildTwilioMessagingTwiml('No pude procesar tu mensaje en este momento. Intenta de nuevo.'),
      {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' }
      }
    )
  }
}
