import type { OrderRecord } from '@/src/lib/crm/domain-types'
import { getPrisma } from '@/src/lib/db/prisma'

export const findOrderStatus = async (orderIdOrPhone: string): Promise<OrderRecord | null> => {
  const normalized = orderIdOrPhone.trim()
  if (!normalized) {
    return null
  }

  const prisma = await getPrisma()
  const byId = await prisma.order.findUnique({
    where: { externalOrderId: normalized }
  })

  if (byId) {
    return {
      orderId: byId.externalOrderId,
      customerPhone: byId.customerId || 'unknown',
      status: byId.status as OrderRecord['status'],
      total: Number(byId.total),
      updatedAt: byId.updatedAt.toISOString()
    }
  }

  const byCustomer = await prisma.order.findFirst({
    where: { customer: { phone: normalized } },
    orderBy: { updatedAt: 'desc' }
  })

  if (!byCustomer) {
    return null
  }

  return {
    orderId: byCustomer.externalOrderId,
    customerPhone: normalized,
    status: byCustomer.status as OrderRecord['status'],
    total: Number(byCustomer.total),
    updatedAt: byCustomer.updatedAt.toISOString()
  }
}
