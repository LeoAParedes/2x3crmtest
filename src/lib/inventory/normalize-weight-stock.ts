import type { PrismaClient } from '@prisma/client'

import {
  WEIGHT_STOCK_NORMALIZED_ACTION,
  inferWeightSupport,
  isLegacyKilogramStock
} from '@/src/lib/inventory/weight-units'

type PrismaLike = Pick<PrismaClient, 'inventoryItem' | 'systemActionLog'>

export const ensureCanonicalWeightStocks = async (
  prisma: PrismaLike,
  actor?: { userId: string; username: string; role: string }
) => {
  const alreadyNormalized = await prisma.systemActionLog.findFirst({
    where: { action: WEIGHT_STOCK_NORMALIZED_ACTION },
    select: { id: true }
  })
  if (alreadyNormalized) return { normalized: false, updatedCount: 0 }

  const candidates = await prisma.inventoryItem.findMany({
    select: {
      id: true,
      sku: true,
      category: true,
      aisle: true,
      stock: true,
      minStock: true
    }
  })

  const legacyItems = candidates.filter(item =>
    isLegacyKilogramStock(item.stock, inferWeightSupport(item.category, item.aisle))
  )

  for (const item of legacyItems) {
    await prisma.inventoryItem.updateMany({
      where: {
        id: item.id,
        stock: { gt: 0, lt: 1000 }
      },
      data: {
        stock: { multiply: 1000 },
        ...(isLegacyKilogramStock(item.minStock, true) ? { minStock: { multiply: 1000 } } : {})
      }
    })
  }

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: actor?.userId || null,
      actorUsername: actor?.username || 'system',
      actorRole: actor?.role || 'admin',
      action: WEIGHT_STOCK_NORMALIZED_ACTION,
      entityType: 'InventoryItem',
      entityId: 'weight-stock',
      status: 'success',
      metadata: {
        updatedCount: legacyItems.length,
        skus: legacyItems.slice(0, 50).map(item => item.sku)
      }
    }
  })

  return { normalized: true, updatedCount: legacyItems.length }
}
