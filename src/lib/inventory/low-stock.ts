export const ARCHIVED_AISLE = '__archived__'

export type LowStockComparable = {
  stock: number
  minStock: number
  aisle?: string | null
  sku?: string | null
  productName?: string | null
}

export const DEFAULT_MIN_STOCK = 20

/** Soft-deleted catalog rows: aisle marker, renamed SKU, or Archivado label. */
export const isArchivedInventoryItem = (item: {
  aisle?: string | null
  sku?: string | null
  productName?: string | null
}) => {
  const aisle = typeof item.aisle === 'string' ? item.aisle.trim().toLowerCase() : ''
  if (aisle === ARCHIVED_AISLE || aisle.includes('archived')) return true
  if (typeof item.sku === 'string' && /archived/i.test(item.sku)) return true
  if (typeof item.productName === 'string' && /archivado/i.test(item.productName)) return true
  return false
}

/** Prisma filter for non-archived InventoryItem rows (best-effort; always re-check in JS). */
export const activeInventoryItemWhere = {
  AND: [
    {
      OR: [{ aisle: null }, { aisle: { not: ARCHIVED_AISLE } }]
    },
    { NOT: { sku: { contains: 'archived', mode: 'insensitive' as const } } },
    { NOT: { productName: { contains: 'Archivado', mode: 'insensitive' as const } } }
  ]
}

/** Low-stock alerts never include archived catalog rows. */
export const isLowStockItem = (item: LowStockComparable) => {
  if (isArchivedInventoryItem(item)) return false
  return item.stock <= item.minStock
}

export const getLowStockUrgency = (item: LowStockComparable) => {
  const threshold = Math.max(1, item.minStock)
  return item.stock / threshold
}

export const compareLowStockUrgency = (left: LowStockComparable, right: LowStockComparable) => {
  const urgencyDelta = getLowStockUrgency(left) - getLowStockUrgency(right)
  if (urgencyDelta !== 0) return urgencyDelta
  return left.stock - right.stock
}

/** Stored-unit gap between minimum threshold and current stock (grams for weight, pieces otherwise). */
export const getRestockDeficit = (stock: number, minStock: number) => Math.max(0, minStock - stock)

/** Billable quantity for cost math: kg for weight inventory, pieces otherwise. */
export const getRestockBillableQuantity = (deficit: number, supportsWeight: boolean) => {
  if (deficit <= 0) return 0
  if (supportsWeight) {
    return Number((deficit / 1000).toFixed(3))
  }
  return deficit
}

export const getRestockEstimatedCost = (
  stock: number,
  minStock: number,
  unitPrice: number,
  supportsWeight: boolean
) => {
  const deficit = getRestockDeficit(stock, minStock)
  if (deficit <= 0) return 0
  const billableQuantity = getRestockBillableQuantity(deficit, supportsWeight)
  return Number((unitPrice * billableQuantity).toFixed(2))
}
