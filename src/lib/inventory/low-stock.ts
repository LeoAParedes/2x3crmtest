export type LowStockComparable = {
  stock: number
  minStock: number
}

export const DEFAULT_MIN_STOCK = 20

export const isLowStockItem = (item: LowStockComparable) => item.stock <= item.minStock

export const getLowStockUrgency = (item: LowStockComparable) => {
  const threshold = Math.max(1, item.minStock)
  return item.stock / threshold
}

export const compareLowStockUrgency = (left: LowStockComparable, right: LowStockComparable) => {
  const urgencyDelta = getLowStockUrgency(left) - getLowStockUrgency(right)
  if (urgencyDelta !== 0) return urgencyDelta
  return left.stock - right.stock
}
