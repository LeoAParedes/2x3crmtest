import { z } from 'zod'

import { ERP_TOOL_IDS, ERP_TOOL_LABELS } from '@/src/lib/ai/erp-tool-ids'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { getMastraSettings, updateMastraSettings } from '@/src/lib/crm/mastra-settings'
import { hasLlmProviderConfig } from '@/src/lib/config/env'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'
import { enforceSensitiveRateLimit } from '@/src/lib/security/sensitive-rate-limit'

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  modelId: z.string().min(3).max(120).optional(),
  instructions: z.string().min(40).max(8000).optional(),
  allowWriteActions: z.boolean().optional(),
  allowFinancialActions: z.boolean().optional(),
  maxReplyChars: z.number().int().min(120).max(4000).optional(),
  defaultLocale: z.string().min(2).max(10).optional(),
  allowedErpTools: z.array(z.enum(ERP_TOOL_IDS)).max(ERP_TOOL_IDS.length).optional()
})

const mastraSettingsResponseSchema = z.object({
  success: z.literal(true),
  settings: z.object({
    enabled: z.boolean(),
    modelId: z.string().min(3).max(120),
    instructions: z.string().min(40).max(8000),
    allowWriteActions: z.boolean(),
    allowFinancialActions: z.boolean(),
    maxReplyChars: z.number().int().min(120).max(4000),
    defaultLocale: z.string().min(2).max(10),
    allowedErpTools: z.array(z.enum(ERP_TOOL_IDS)),
    updatedAt: z.string()
  }),
  providerStatus: z.object({
    llmConfigured: z.boolean()
  }),
  erpToolCatalog: z.array(
    z.object({
      id: z.enum(ERP_TOOL_IDS),
      label: z.string()
    })
  )
})

const erpToolCatalog = ERP_TOOL_IDS.map(id => ({
  id,
  label: ERP_TOOL_LABELS[id]
}))

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  const rate = enforceSensitiveRateLimit(request, {
    scope: 'crm:mastra-settings:get',
    limit: 120,
    windowMs: 60_000
  })
  if (!rate.allowed) {
    return rate.response
  }

  try {
    const payload = mastraSettingsResponseSchema.safeParse({
      success: true,
      settings: await getMastraSettings(),
      providerStatus: {
        llmConfigured: hasLlmProviderConfig
      },
      erpToolCatalog
    })

    if (!payload.success) {
      return jsonError('Invalid mastra settings response shape', 500, {
        code: 'MASTRA_SETTINGS_RESPONSE_INVALID',
        details: payload.error.flatten(),
        requestId: access.context.requestId
      })
    }

    return jsonOk(payload.data)
  } catch (error) {
    return jsonError('Unable to load Mastra settings', 500, {
      code: 'MASTRA_SETTINGS_STORAGE_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  const rate = enforceSensitiveRateLimit(request, {
    scope: 'crm:mastra-settings:post',
    limit: 30,
    windowMs: 60_000
  })
  if (!rate.allowed) {
    return rate.response
  }

  try {
    const body = await request.json()
    const payload = updateSchema.parse(body)
    const updated = await updateMastraSettings(payload)
    await safeRecordAgentAction({
      actionType: 'mastra.settings.updated',
      status: 'success',
      actorRole: access.context.role,
      actorType: 'human',
      metadata: {
        changedKeys: Object.keys(payload)
      }
    })

    const responsePayload = mastraSettingsResponseSchema.safeParse({
      success: true,
      settings: updated,
      providerStatus: {
        llmConfigured: hasLlmProviderConfig
      },
      erpToolCatalog
    })

    if (!responsePayload.success) {
      return jsonError('Invalid mastra settings response shape', 500, {
        code: 'MASTRA_SETTINGS_RESPONSE_INVALID',
        details: responsePayload.error.flatten(),
        requestId: access.context.requestId
      })
    }

    return jsonOk(responsePayload.data)
  } catch (error) {
    return jsonError('Invalid mastra settings payload', 400, {
      code: 'MASTRA_SETTINGS_PAYLOAD_INVALID',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
