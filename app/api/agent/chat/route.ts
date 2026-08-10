import { webChatPayloadSchema } from '@/src/lib/crm/channel-schema'
import { normalizeWebChatPayload } from '@/src/lib/crm/channel-normalizer'
import { runCrmAgent } from '@/src/lib/crm/agent/orchestrator'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { consumeRateLimit } from '@/src/lib/security/rate-limit'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { pushConversationAudit } from '@/src/lib/crm/audit-log'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const payload = webChatPayloadSchema.parse(body)
    const normalized = normalizeWebChatPayload(payload)

    const rate = consumeRateLimit(`web:${normalized.sessionId}`, 25, 60_000)
    if (!rate.allowed) {
      return jsonError('Too many requests for this session, wait and try again', 429)
    }

    const reply = await runCrmAgent(normalized)
    await pushConversationAudit(normalized, reply)
    await safeRecordAgentAction({
      actionType: 'agent.reply.generated',
      status: 'success',
      actorType: 'agent',
      channel: 'web',
      sessionId: normalized.sessionId,
      customerId: normalized.customerId,
      metadata: {
        intent: reply.intent,
        runMode: reply.runMode,
        handoffRequired: Boolean(reply.handoff?.required)
      }
    })

    return jsonOk({
      success: true,
      reply
    })
  } catch (error) {
    return jsonError('Invalid chat request payload', 400, error instanceof Error ? error.message : 'unknown error')
  }
}
