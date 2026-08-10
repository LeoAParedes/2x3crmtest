import { z } from 'zod'

import { listConversationAudit } from '@/src/lib/crm/audit-log'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { getCrmMetricsSnapshot } from '@/src/lib/observability/metrics-store'
import { listApprovalRequests } from '@/src/lib/crm/services/approval-service'
import { getPrisma } from '@/src/lib/db/prisma'
import { requireApiAccess } from '@/src/lib/security/api-auth'
import { crmRoleSchema } from '@/src/lib/security/rbac'
import { enforceSensitiveRateLimit } from '@/src/lib/security/sensitive-rate-limit'

const dashboardResponseSchema = z.object({
  success: z.literal(true),
  role: crmRoleSchema,
  metrics: z.object({
    generatedAt: z.string(),
    inventoryItems: z.number(),
    lowStockItems: z.number(),
    totalOrders: z.number(),
    openBalances: z.number(),
    openReturnCases: z.number(),
    openHandoffs: z.number(),
    pendingPaymentPromises: z.number(),
    pendingApprovals: z.number(),
    recentConversations: z.number()
  }),
  conversations: z.array(
    z.object({
      id: z.string(),
      createdAt: z.string(),
      channel: z.enum(['web', 'whatsapp']),
      sessionId: z.string(),
      customerId: z.string().optional(),
      inbound: z.string(),
      outbound: z.string(),
      intent: z.string(),
      runMode: z.enum(['mastra', 'fallback']),
      handoffRequired: z.boolean()
    })
  ),
  pendingActions: z.object({
    handoffs: z.array(z.unknown()),
    returns: z.array(z.unknown()),
    paymentPromises: z.array(z.unknown()),
    approvals: z.array(z.unknown())
  })
})

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  const rate = enforceSensitiveRateLimit(request, {
    scope: 'crm:dashboard',
    limit: 120,
    windowMs: 60_000
  })
  if (!rate.allowed) {
    return rate.response
  }

  try {
    const prisma = await getPrisma()
    const [metrics, conversations, handoffs, returns, paymentPromises, approvals] = await Promise.all([
      getCrmMetricsSnapshot(),
      listConversationAudit(25),
      prisma.handoffTicket.findMany({ where: { status: 'opened' }, take: 25, orderBy: { createdAt: 'desc' } }),
      prisma.returnCase.findMany({ where: { status: 'opened' }, take: 25, orderBy: { createdAt: 'desc' } }),
      prisma.paymentPromise.findMany({ where: { status: 'pending' }, take: 25, orderBy: { createdAt: 'desc' } }),
      listApprovalRequests()
    ])
  const payload = dashboardResponseSchema.safeParse({
    success: true,
    role: access.context.role,
    metrics,
    conversations,
    pendingActions: {
      handoffs,
      returns,
      paymentPromises,
      approvals: approvals.slice(0, 25)
    }
  })

  if (!payload.success) {
    return jsonError('Invalid dashboard response shape', 500, {
      code: 'DASHBOARD_RESPONSE_INVALID',
      details: payload.error.flatten(),
      requestId: access.context.requestId
    })
  }

    return jsonOk(payload.data)
  } catch (error) {
    return jsonError('Unable to load dashboard data', 500, {
      code: 'DASHBOARD_STORAGE_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
