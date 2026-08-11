import { runCrmAgent } from '@/src/lib/crm/agent/orchestrator'
import { normalizeTwilioWebhookMessage } from '@/src/lib/crm/channel-normalizer'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { pushConversationAudit } from '@/src/lib/crm/audit-log'
import { jsonError } from '@/src/lib/http/json-response'
import { appLog } from '@/src/lib/observability/app-logger'
import { markEventProcessed, wasEventProcessed } from '@/src/lib/security/idempotency'
import { consumeRateLimit } from '@/src/lib/security/rate-limit'
import {
  buildTwilioMessagingTwiml,
  diagnoseTwilioSignature,
  isValidTwilioSignature,
  parseTwilioWebhookForm,
  resolveTwilioWebhookUrlCandidates
} from '@/src/lib/whatsapp/twilio'

/**
 * Twilio WhatsApp webhook.
 * Configure in Twilio Console → WhatsApp Sender → "When a message comes in":
 *   POST https://<your-host>/api/whatsapp/twilio/webhook
 *
 * Returns TwiML `<Response><Message>...</Message></Response>`.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const params = new URLSearchParams(rawBody)
  const signature = request.headers.get('x-twilio-signature')
  const urlCandidates = resolveTwilioWebhookUrlCandidates(request)
  const diagnosis = diagnoseTwilioSignature({
    signature,
    urlCandidates,
    params
  })

  // #region agent log
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify({
      sessionId: '449600',
      runId: 'twilio-sig',
      hypothesisId: 'A',
      location: 'twilio/webhook/route.ts:POST',
      message: 'Twilio signature diagnosis',
      data: {
        ...diagnosis,
        requestUrl: request.url,
        urlCandidates,
        paramKeyCount: [...params.keys()].length,
        hasBody: Boolean(params.get('Body')),
        hasFrom: Boolean(params.get('From'))
      },
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion

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
      return new Response(buildTwilioMessagingTwiml(''), {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' }
      })
    }

    await markEventProcessed(inbound.messageSid)

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

    // #region agent log
    fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
      body: JSON.stringify({
        sessionId: '449600',
        runId: 'twilio-sig',
        hypothesisId: 'C',
        location: 'twilio/webhook/route.ts:agent',
        message: 'Twilio agent reply ready',
        data: {
          intent: reply.intent,
          runMode: reply.runMode,
          replyLen: reply.reply?.length ?? 0,
          matchedUrl: diagnosis.matchedUrl
        },
        timestamp: Date.now()
      })
    }).catch(() => {})
    // #endregion

    await pushConversationAudit(normalized.message, reply)
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
        handoffRequired: Boolean(reply.handoff?.required)
      }
    })

    return new Response(buildTwilioMessagingTwiml(reply.reply), {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' }
    })
  } catch (error) {
    appLog('error', 'Twilio webhook processing error', {
      reason: error instanceof Error ? error.message : 'unknown error'
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
