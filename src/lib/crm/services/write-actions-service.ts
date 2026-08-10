import type { HandoffTicket, PaymentPromise, ReturnCase } from '@/src/lib/crm/domain-types'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { createApprovalRequest } from '@/src/lib/crm/services/approval-service'
import { getPrisma } from '@/src/lib/db/prisma'

const shouldRequestReturnApproval = (reason: string) => {
  const normalized = reason.toLowerCase()
  return normalized.includes('fraude') || normalized.includes('chargeback') || normalized.includes('abuso')
}

const shouldRequestPaymentPromiseApproval = (amount: number) => amount >= 150

const ensureCustomer = async (customerId: string) => {
  const prisma = await getPrisma()
  return prisma.customer.upsert({
    where: { id: customerId },
    update: {},
    create: { id: customerId, displayName: customerId }
  })
}

export const createReturnCase = async (customerId: string, reason: string): Promise<ReturnCase> => {
  const prisma = await getPrisma()
  const customer = await ensureCustomer(customerId)
  const created = await prisma.returnCase.create({
    data: { customerId: customer.id, reason, status: 'opened' }
  })
  const output: ReturnCase = {
    caseId: created.id,
    customerId: created.customerId,
    reason: created.reason,
    status: created.status as ReturnCase['status'],
    createdAt: created.createdAt.toISOString()
  }
  if (shouldRequestReturnApproval(reason)) {
    await createApprovalRequest('return_case', output.caseId, 'High-risk return reason requires supervisor approval')
  }
  await safeRecordAgentAction({
    actionType: 'return_case.create',
    status: 'success',
    customerId,
    targetId: output.caseId,
    metadata: { reason }
  })
  return output
}

export const createHumanHandoff = async (
  customerId: string,
  reason: string,
  priority: HandoffTicket['priority']
): Promise<HandoffTicket> => {
  const prisma = await getPrisma()
  const customer = await ensureCustomer(customerId)
  const created = await prisma.handoffTicket.create({
    data: { customerId: customer.id, reason, priority, status: 'opened' }
  })
  const output: HandoffTicket = {
    ticketId: created.id,
    customerId: created.customerId,
    reason: created.reason,
    priority: created.priority as HandoffTicket['priority'],
    createdAt: created.createdAt.toISOString()
  }
  await safeRecordAgentAction({
    actionType: 'handoff.create',
    status: 'success',
    customerId,
    targetId: output.ticketId,
    metadata: { reason, priority }
  })
  return output
}

export const createPaymentPromise = async (
  customerId: string,
  amount: number,
  dueDate: string
): Promise<PaymentPromise> => {
  const prisma = await getPrisma()
  const customer = await ensureCustomer(customerId)
  const created = await prisma.paymentPromise.create({
    data: {
      customerId: customer.id,
      amount,
      dueDate: new Date(dueDate),
      status: 'pending'
    }
  })
  const output: PaymentPromise = {
    promiseId: created.id,
    customerId: created.customerId,
    amount: Number(created.amount),
    dueDate: created.dueDate.toISOString(),
    status: created.status as PaymentPromise['status']
  }
  if (shouldRequestPaymentPromiseApproval(amount)) {
    await createApprovalRequest(
      'payment_promise',
      output.promiseId,
      'High amount payment promise requires finance approval'
    )
  }
  await safeRecordAgentAction({
    actionType: 'payment_promise.create',
    status: 'success',
    customerId,
    targetId: output.promiseId,
    metadata: { amount, dueDate }
  })
  return output
}
