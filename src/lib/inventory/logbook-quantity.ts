import { gramsToKilograms } from '@/src/lib/inventory/weight-units'

export type SaleQuantityLine = {
  quantity: number
  unitMode: 'piece' | 'weight'
}

export const formatStockQuantityLabel = (quantity: number, supportsWeight: boolean) => {
  const absolute = Math.abs(quantity)
  if (supportsWeight) {
    return `${gramsToKilograms(absolute).toFixed(3)} kg`
  }
  return `${absolute} pz`
}

/** unitCost/unitPrice are always per sellable unit: $/kg for weight, $/pz for pieces. */
export const formatUnitCostLabel = (unitCost: number, supportsWeight: boolean) => {
  const unit = supportsWeight ? 'kg' : 'pz'
  return `${unitCost.toFixed(2)} MXN / ${unit}`
}

/**
 * Money total from stored inventory quantity.
 * Weight stock is grams; billable cost uses kilograms. Piece stock is 1:1.
 */
export const calculateBillableAmount = (
  storedQuantity: number,
  unitCost: number,
  supportsWeight: boolean
) => {
  const billable = supportsWeight ? gramsToKilograms(Math.abs(storedQuantity)) : Math.abs(storedQuantity)
  return Number((billable * unitCost).toFixed(2))
}

export const summarizeSaleQuantities = (lines: SaleQuantityLine[]) => {
  let pieceCount = 0
  let weightGrams = 0

  for (const line of lines) {
    if (line.unitMode === 'weight') {
      weightGrams += line.quantity
      continue
    }
    pieceCount += line.quantity
  }

  return { pieceCount, weightGrams }
}

export const formatSaleQuantitySummary = (pieceCount: number, weightGrams: number) => {
  const parts: string[] = []
  if (pieceCount > 0) {
    parts.push(`${pieceCount} pz`)
  }
  if (weightGrams > 0) {
    parts.push(`${gramsToKilograms(weightGrams).toFixed(3)} kg`)
  }
  if (!parts.length) {
    return '0 pz'
  }
  return parts.join(' | ')
}
