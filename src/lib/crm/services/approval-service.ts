import type { ApprovalRequest } from '@/src/lib/crm/domain-types'
import { getPrisma } from '@/src/lib/db/prisma'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'

const mapApproval = (row: {
  id: string
  actionType: string
  targetId: string
  reason: string
  status: string
  createdAt: Date
  resolvedAt: Date | null
}): ApprovalRequest => ({
  approvalId: row.id,
  actionType: row.actionType as ApprovalRequest['actionType'],
  targetId: row.targetId,
  reason: row.reason,
  status: row.status as ApprovalRequest['status'],
  createdAt: row.createdAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString()
})

export const buildApprovalResolutionMetadata = (approvalId: string, decision: 'approved' | 'rejected') => ({
  approvalId,
  decision
})

export const createApprovalRequest = async (
  actionType: ApprovalRequest['actionType'],
  targetId: string,
  reason: string
) => {
  const prisma = await getPrisma()
  const created = await prisma.approvalRequest.create({
    data: { actionType, targetId, reason, status: 'pending' }
  })
  await safeRecordAgentAction({
    actionType: 'approval.requested',
    status: 'pending',
    targetId,
    metadata: {
      approvalId: created.id,
      actionType,
      reason
    }
  })
  return mapApproval(created)
}

export const listApprovalRequests = async () => {
  const prisma = await getPrisma()
  const rows = await prisma.approvalRequest.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(mapApproval)
}

export const resolveApprovalRequest = async (approvalId: string, decision: 'approved' | 'rejected') => {
  const prisma = await getPrisma()
  const existing = await prisma.approvalRequest.findUnique({ where: { id: approvalId } })
  if (!existing) {
    return null
  }

  const updated = await prisma.approvalRequest.update({
    where: { id: approvalId },
    data: { status: decision, resolvedAt: new Date() }
  })
  await safeRecordAgentAction({
    actionType: 'approval.resolved',
    status: 'success',
    targetId: updated.targetId,
    metadata: {
      ...buildApprovalResolutionMetadata(approvalId, decision)
    }
  })
  return mapApproval(updated)
}
