import { z } from 'zod'

import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { appLog } from '@/src/lib/observability/app-logger'
import { requireApiAccess } from '@/src/lib/security/api-auth'
import { enforceSensitiveRateLimit } from '@/src/lib/security/sensitive-rate-limit'
import { sendMetaTextMessage } from '@/src/lib/whatsapp/meta-client'

const outboundSchema = z.object({
  to: z.string().min(7).max(32),
  message: z.string().min(1).max(4000)
})

const outboundResponseSchema = z.object({
  success: z.literal(true),
  providerMessageId: z.string().min(1).optional()
})

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  const rate = enforceSensitiveRateLimit(request, {
    scope: 'whatsapp:send',
    limit: 45,
    windowMs: 60_000
  })
  if (!rate.allowed) {
    return rate.response
  }

  try {
    const body = await request.json()
    const payload = outboundSchema.parse(body)
    const response = await sendMetaTextMessage(payload)

    if (!response.sent) {
      await safeRecordAgentAction({
        actionType: 'whatsapp.send.rejected',
        status: 'failed',
        actorRole: access.context.role,
        actorType: 'human',
        channel: 'whatsapp',
        customerId: payload.to,
        metadata: {
          reason: response.reason
        }
      })
      appLog('warn', 'WhatsApp send endpoint failed to deliver outbound message', {
        reason: response.reason,
        to: payload.to
      })
      return jsonError(response.reason || 'Unable to deliver message', 502, {
        code: 'WHATSAPP_SEND_PROVIDER_ERROR',
        requestId: access.context.requestId
      })
    }

    await safeRecordAgentAction({
      actionType: 'whatsapp.send.accepted',
      status: 'success',
      actorRole: access.context.role,
      actorType: 'human',
      channel: 'whatsapp',
      customerId: payload.to,
      targetId: response.providerMessageId,
      metadata: {
        deliveredBy: 'meta-cloud-api'
      }
    })

    const responsePayload = outboundResponseSchema.safeParse({
      success: true,
      providerMessageId: response.providerMessageId
    })

    if (!responsePayload.success) {
      return jsonError('Invalid whatsapp send response shape', 500, {
        code: 'WHATSAPP_SEND_RESPONSE_INVALID',
        details: responsePayload.error.flatten(),
        requestId: access.context.requestId
      })
    }

    return jsonOk(responsePayload.data)
  } catch (error) {
    return jsonError('Invalid outbound payload', 400, {
      code: 'WHATSAPP_SEND_PAYLOAD_INVALID',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
