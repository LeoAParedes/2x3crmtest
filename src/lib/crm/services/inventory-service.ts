import type { InventoryItem } from '@/src/lib/crm/domain-types'
import { getPrisma } from '@/src/lib/db/prisma'

export const findInventoryByQuery = async (query: string): Promise<InventoryItem[]> => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return []
  }

  const prisma = await getPrisma()
  const rows = await prisma.inventoryItem.findMany({
    where: {
      OR: [
        { sku: { contains: normalized, mode: 'insensitive' } },
        { productName: { contains: normalized, mode: 'insensitive' } },
        { category: { contains: normalized, mode: 'insensitive' } }
      ]
    },
    take: 10
  })

  return rows.map(row => ({
    sku: row.sku,
    name: row.productName,
    category: row.category,
    price: Number(row.unitPrice),
    stock: row.stock,
    aisle: row.aisle || 'N/A'
  }))
}
