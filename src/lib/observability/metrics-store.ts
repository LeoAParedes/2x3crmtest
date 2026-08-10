import { getPrisma } from '@/src/lib/db/prisma'

export type CrmMetricsSnapshot = {
  generatedAt: string
  inventoryItems: number
  lowStockItems: number
  totalOrders: number
  openBalances: number
  openReturnCases: number
  openHandoffs: number
  pendingPaymentPromises: number
  pendingApprovals: number
  recentConversations: number
}

export const getCrmMetricsSnapshot = async (): Promise<CrmMetricsSnapshot> => {
  const prisma = await getPrisma()
  const [
    inventoryItems,
    lowStockItems,
    totalOrders,
    openBalances,
    openReturnCases,
    openHandoffs,
    pendingPaymentPromises,
    pendingApprovals,
    recentConversations
  ] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.inventoryItem.count({ where: { stock: { lte: 20 } } }),
    prisma.order.count(),
    prisma.financeAccount.count({ where: { openBalance: { gt: 0 } } }),
    prisma.returnCase.count({ where: { status: 'opened' } }),
    prisma.handoffTicket.count({ where: { status: 'opened' } }),
    prisma.paymentPromise.count({ where: { status: 'pending' } }),
    prisma.approvalRequest.count({ where: { status: 'pending' } }),
    prisma.conversation.count()
  ])

  return {
    generatedAt: new Date().toISOString(),
    inventoryItems,
    lowStockItems,
    totalOrders,
    openBalances,
    openReturnCases,
    openHandoffs,
    pendingPaymentPromises,
    pendingApprovals,
    recentConversations
  }
}
