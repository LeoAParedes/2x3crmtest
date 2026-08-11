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
