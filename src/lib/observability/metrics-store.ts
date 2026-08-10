import { getPrisma } from '@/src/lib/db/prisma'
import { Prisma } from '@prisma/client'

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
    lowStockRows,
    totalOrders,
    openBalances,
    openReturnCases,
    openHandoffs,
    pendingPaymentPromises,
    pendingApprovals,
    recentConversations
  ] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "InventoryItem"
      WHERE stock <= "minStock"
        AND ("aisle" IS NULL OR "aisle" <> '__archived__')
    `),
    prisma.order.count(),
    prisma.financeAccount.count({ where: { openBalance: { gt: 0 } } }),
    prisma.returnCase.count({ where: { status: 'opened' } }),
    prisma.handoffTicket.count({ where: { status: 'opened' } }),
    prisma.paymentPromise.count({ where: { status: 'pending' } }),
    prisma.approvalRequest.count({ where: { status: 'pending' } }),
    prisma.conversation.count()
  ])

  const lowStockItems = lowStockRows[0]?.count ?? 0

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
