import { z } from 'zod'

import { env, hasLlmProviderConfig, hasMetaProviderConfig } from '@/src/lib/config/env'
import { runCrmAgent } from '@/src/lib/crm/agent/orchestrator'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { normalizeMetaWebhookPayload } from '@/src/lib/crm/channel-normalizer'
import { getMastraSettings } from '@/src/lib/crm/mastra-settings'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { appLog } from '@/src/lib/observability/app-logger'
import { requireApiAccess } from '@/src/lib/security/api-auth'
import { sendMetaTextMessage } from '@/src/lib/whatsapp/meta-client'

const bodySchema = z.object({
  message: z.string().min(1).max(500).default('Hola self-test'),
  phone: z.string().min(7).max(32).default('5216862256637'),
  send: z.boolean().default(false)
})

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  try {
    const raw = await request.json().catch(() => ({}))
    const input = bodySchema.parse(raw)
    const settings = await getMastraSettings()

    const syntheticPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: env.metaBusinessAccountId || 'self-test-waba',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  phone_number_id: env.metaPhoneNumberId || 'self-test-phone'
                },
                contacts: [{ wa_id: input.phone, profile: { name: 'Self Test' } }],
                messages: [
                  {
                    from: input.phone,
                    id: `wamid.self-test.${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: input.message }
                  }
                ]
              }
            }
          ]
        }
      ]
    }

    const inboundMessages = normalizeMetaWebhookPayload(syntheticPayload as never)
    if (inboundMessages.length === 0) {
      return jsonError('Self-test normalize produced zero messages', 500)
    }

    const inbound = inboundMessages[0]
    const reply = await runCrmAgent(inbound.message)

    let outbound: { sent: boolean; reason?: string; providerMessageId?: string } | null = null
    if (input.send) {
      outbound = await sendMetaTextMessage({
        to: input.phone,
        message: `[self-test] ${reply.reply}`
      })
      await safeRecordAgentAction({
        actionType: outbound.sent ? 'whatsapp.self_test.sent' : 'whatsapp.self_test.send_failed',
        status: outbound.sent ? 'success' : 'failed',
        actorRole: access.context.role,
        actorType: 'human',
        channel: 'whatsapp',
        customerId: input.phone,
        metadata: {
          reason: outbound.reason,
          providerMessageId: outbound.providerMessageId,
          runMode: reply.runMode
        }
      })
    } else {
      await safeRecordAgentAction({
        actionType: 'whatsapp.self_test.agent_only',
        status: 'success',
        actorRole: access.context.role,
        actorType: 'human',
        channel: 'whatsapp',
        customerId: input.phone,
        metadata: {
          runMode: reply.runMode,
          intent: reply.intent
        }
      })
    }

    return jsonOk({
      success: true,
      config: {
        metaProviderConfigured: hasMetaProviderConfig,
        metaAppSecretConfigured: Boolean(env.metaAppSecret),
        llmConfigured: hasLlmProviderConfig,
        agentEnabled: settings.enabled,
        modelId: settings.modelId,
        allowedErpToolsCount: settings.allowedErpTools.length
      },
      normalize: {
        messageCount: inboundMessages.length,
        sourcePhone: inbound.sourcePhone
      },
      agent: {
        runMode: reply.runMode,
        intent: reply.intent,
        replyPreview: reply.reply.slice(0, 240)
      },
      outbound
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    appLog('error', 'WhatsApp self-test failed', { reason })
    return jsonError(`Self-test failed: ${reason}`, 500)
  }
}
