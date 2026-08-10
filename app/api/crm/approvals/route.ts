import { z } from 'zod'

import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'
import { enforceSensitiveRateLimit } from '@/src/lib/security/sensitive-rate-limit'
import { listApprovalRequests, resolveApprovalRequest } from '@/src/lib/crm/services/approval-service'

const decisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['approved', 'rejected'])
})

const approvalResponseSchema = z.object({
  approvalId: z.string().min(1),
  actionType: z.enum(['return_case', 'payment_promise']),
  targetId: z.string().min(1),
  reason: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: z.string(),
  resolvedAt: z.string().optional()
})

const approvalsListResponseSchema = z.object({
  success: z.literal(true),
  approvals: z.array(approvalResponseSchema)
})

const approvalsDecisionResponseSchema = z.object({
  success: z.literal(true),
  approval: approvalResponseSchema
})

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  const rate = enforceSensitiveRateLimit(request, {
    scope: 'crm:approvals:get',
    limit: 90,
    windowMs: 60_000
  })
  if (!rate.allowed) {
    return rate.response
  }

  const payload = approvalsListResponseSchema.safeParse({
    success: true,
    approvals: await listApprovalRequests()
  })

  if (!payload.success) {
    return jsonError('Invalid approvals response shape', 500, {
      code: 'APPROVALS_RESPONSE_INVALID',
      details: payload.error.flatten(),
      requestId: access.context.requestId
    })
  }

  return jsonOk(payload.data)
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  const rate = enforceSensitiveRateLimit(request, {
    scope: 'crm:approvals:post',
    limit: 40,
    windowMs: 60_000
  })
  if (!rate.allowed) {
    return rate.response
  }

  try {
    const body = await request.json()
    const payload = decisionSchema.parse(body)
    const updated = await resolveApprovalRequest(payload.approvalId, payload.decision)
    if (!updated) {
      return jsonError('Approval not found', 404, {
        code: 'APPROVAL_NOT_FOUND',
        requestId: access.context.requestId
      })
    }

    const responsePayload = approvalsDecisionResponseSchema.safeParse({
      success: true,
      approval: updated
    })

    if (!responsePayload.success) {
      return jsonError('Invalid approval decision response shape', 500, {
        code: 'APPROVAL_DECISION_RESPONSE_INVALID',
        details: responsePayload.error.flatten(),
        requestId: access.context.requestId
      })
    }

    return jsonOk(responsePayload.data)
  } catch (error) {
    return jsonError('Invalid approval payload', 400, {
      code: 'APPROVAL_PAYLOAD_INVALID',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
