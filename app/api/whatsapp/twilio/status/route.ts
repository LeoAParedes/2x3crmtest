import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { jsonError } from '@/src/lib/http/json-response'
import { appLog } from '@/src/lib/observability/app-logger'
import {
  buildTwilioEmptyTwiml,
  diagnoseTwilioSignature,
  isValidTwilioSignature,
  resolveTwilioWebhookUrlCandidates
} from '@/src/lib/whatsapp/twilio'

export const maxDuration = 15

export async function POST(request: Request) {
  const rawBody = await request.text()
  const params = new URLSearchParams(rawBody)
  const signature = request.headers.get('x-twilio-signature')
  const urlCandidates = resolveTwilioWebhookUrlCandidates(request)
  const diagnosis = diagnoseTwilioSignature({ signature, urlCandidates, params })

  if (
    !isValidTwilioSignature({
      signature,
      url: request.url,
      urlCandidates,
      params
    })
  ) {
    appLog('warn', 'Twilio delivery callback rejected: invalid signature', {
      authTokenConfigured: diagnosis.authTokenConfigured,
      signaturePresent: diagnosis.signaturePresent,
      candidateCount: diagnosis.candidateCount
    })
    return jsonError('Invalid Twilio signature', 401)
  }

  const messageSid = params.get('MessageSid')?.trim() || null
  const messageStatus = params.get('MessageStatus')?.trim() || 'unknown'
  const errorCode = params.get('ErrorCode')?.trim() || null
  const channelStatusMessage = params.get('ChannelStatusMessage')?.trim() || null
  const eventType = params.get('EventType')?.trim() || null

  appLog('info', 'Twilio WhatsApp delivery status', {
    messageSid,
    messageStatus,
    errorCode,
    channelStatusMessage,
    eventType
  })

  await safeRecordAgentAction({
    actionType: 'whatsapp.delivery.status',
    status: ['failed', 'undelivered'].includes(messageStatus) ? 'failed' : 'success',
    actorType: 'system',
    channel: 'whatsapp',
    targetId: messageSid || undefined,
    metadata: {
      provider: 'twilio',
      messageStatus,
      errorCode,
      channelStatusMessage,
      eventType
    }
  })

  // #region agent log
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify({
      sessionId: '449600',
      runId: 'whatsapp-twilio-delivery',
      hypothesisId: 'H8',
      location: 'app/api/whatsapp/twilio/status/route.ts',
      message: 'Twilio delivery callback received',
      data: { messageSid, messageStatus, errorCode, channelStatusMessage, eventType },
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion

  return new Response(buildTwilioEmptyTwiml(), {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
  })
}
