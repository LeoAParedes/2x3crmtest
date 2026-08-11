export const ARCHIVED_AISLE = '__archived__'

export type LowStockComparable = {
  stock: number
  minStock: number
  aisle?: string | null
}

export const DEFAULT_MIN_STOCK = 20

export const isArchivedInventoryItem = (item: { aisle?: string | null }) =>
  item.aisle === ARCHIVED_AISLE

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
