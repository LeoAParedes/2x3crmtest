import type { Prisma } from '@prisma/client'
import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { redactPii } from '@/src/lib/security/pii-redaction'
import { crmRoleSchema, type CrmRole } from '@/src/lib/security/rbac'

const actionStatusSchema = z.enum(['success', 'failed', 'pending'])
const actionActorTypeSchema = z.enum(['agent', 'system', 'human'])
const actionPayloadSchema = z.object({
  actorRole: crmRoleSchema.optional(),
  actorType: actionActorTypeSchema.default('agent'),
  channel: z.enum(['web', 'whatsapp']).optional(),
  sessionId: z.string().optional(),
  customerId: z.string().optional(),
  targetId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

export type AgentActionStatus = z.infer<typeof actionStatusSchema>
export type AgentActionActorType = z.infer<typeof actionActorTypeSchema>

export type AgentActionAuditEntry = {
  id: string
  actionType: string
  status: AgentActionStatus
  createdAt: string
  updatedAt: string
  actorRole?: CrmRole
  actorType: AgentActionActorType
  channel?: 'web' | 'whatsapp'
  sessionId?: string
  customerId?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

type RecordAgentActionInput = {
  actionType: string
  status?: AgentActionStatus
  actorRole?: CrmRole
  actorType?: AgentActionActorType
  channel?: 'web' | 'whatsapp'
  sessionId?: string
  customerId?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

type AgentActionFilters = {
  limit?: number
  actionType?: string
  status?: AgentActionStatus
  actorRole?: CrmRole
  from?: string
  to?: string
}

const mapRow = (row: {
  id: string
  actionType: string
  status: string
  createdAt: Date
  updatedAt: Date
  payload: unknown
}): AgentActionAuditEntry => {
  const parsed = actionPayloadSchema.safeParse(row.payload)
  const payload = parsed.success ? parsed.data : { actorType: 'system' as const }
  const status = actionStatusSchema.safeParse(row.status)
  return {
    id: row.id,
    actionType: row.actionType,
    status: status.success ? status.data : 'failed',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...payload
  }
}

export const recordAgentAction = async (input: RecordAgentActionInput): Promise<AgentActionAuditEntry> => {
  const prisma = await getPrisma()
  const payload = redactPii({
    actorRole: input.actorRole,
    actorType: input.actorType || 'agent',
    channel: input.channel,
    sessionId: input.sessionId,
    customerId: input.customerId,
    targetId: input.targetId,
    metadata: input.metadata
  }) as Prisma.InputJsonValue
  const created = await prisma.agentAction.create({
    data: {
      conversationId: input.sessionId || null,
      actionType: input.actionType.trim().slice(0, 120),
      status: input.status || 'success',
      payload
    }
  })
  return mapRow(created)
}

export const safeRecordAgentAction = async (input: RecordAgentActionInput) => {
  await recordAgentAction(input)
}

export const listAgentActions = async (filters: AgentActionFilters = {}) => {
  const prisma = await getPrisma()
  const limit = Math.max(1, Math.min(filters.limit || 50, 200))
  const rows = await prisma.agentAction.findMany({
    where: {
      actionType: filters.actionType,
      status: filters.status,
      createdAt:
        filters.from || filters.to
          ? {
              gte: filters.from ? new Date(filters.from) : undefined,
              lte: filters.to ? new Date(filters.to) : undefined
            }
          : undefined
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(limit * 3, limit)
  })
  return rows
    .map(mapRow)
    .filter(row => !filters.actorRole || row.actorRole === filters.actorRole)
    .slice(0, limit)
}
