import { z } from 'zod'

import { listAgentActions } from '@/src/lib/crm/agent-action-audit'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'
import { crmRoleSchema } from '@/src/lib/security/rbac'
import { enforceSensitiveRateLimit } from '@/src/lib/security/sensitive-rate-limit'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  actionType: z.string().min(1).max(120).optional(),
  status: z.enum(['success', 'failed', 'pending']).optional(),
  actorRole: crmRoleSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional()
})

const auditResponseSchema = z.object({
  success: z.literal(true),
  filters: z.object({
    limit: z.number().int().min(1).max(200),
    actionType: z.string().optional(),
    status: z.enum(['success', 'failed', 'pending']).optional(),
    actorRole: crmRoleSchema.optional(),
    from: z.string().optional(),
    to: z.string().optional()
  }),
  actions: z.array(
    z.object({
      id: z.string().min(1),
      actionType: z.string().min(1),
      status: z.enum(['success', 'failed', 'pending']),
      createdAt: z.string(),
      updatedAt: z.string(),
      actorRole: crmRoleSchema.optional(),
      actorType: z.enum(['agent', 'system', 'human']),
      channel: z.enum(['web', 'whatsapp']).optional(),
      sessionId: z.string().optional(),
      customerId: z.string().optional(),
      targetId: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional()
    })
  )
})

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  const rate = enforceSensitiveRateLimit(request, {
    scope: 'crm:audit:get',
    limit: 60,
    windowMs: 60_000
  })
  if (!rate.allowed) {
    return rate.response
  }

  const { searchParams } = new URL(request.url)
  const parsedQuery = querySchema.safeParse({
    limit: searchParams.get('limit') || undefined,
    actionType: searchParams.get('actionType') || undefined,
    status: searchParams.get('status') || undefined,
    actorRole: searchParams.get('actorRole') || undefined,
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined
  })

  if (!parsedQuery.success) {
    return jsonError('Invalid audit query parameters', 400, {
      code: 'AUDIT_QUERY_INVALID',
      details: parsedQuery.error.flatten(),
      requestId: access.context.requestId
    })
  }

  const filters = {
    limit: parsedQuery.data.limit || 50,
    actionType: parsedQuery.data.actionType,
    status: parsedQuery.data.status,
    actorRole: parsedQuery.data.actorRole,
    from: parsedQuery.data.from,
    to: parsedQuery.data.to
  }

  let actions
  try {
    actions = await listAgentActions(filters)
  } catch (error) {
    return jsonError('Unable to load audit actions', 503, {
      code: 'AUDIT_STORAGE_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }

  const responsePayload = auditResponseSchema.safeParse({
    success: true,
    filters,
    actions
  })

  if (!responsePayload.success) {
    return jsonError('Invalid audit response shape', 500, {
      code: 'AUDIT_RESPONSE_INVALID',
      details: responsePayload.error.flatten(),
      requestId: access.context.requestId
    })
  }

  return jsonOk(responsePayload.data)
}
