export type InventoryMovementForValuation = {
  quantity: number
  unitCost: number | null
  createdAt: Date
}

export type FifoLot = {
  remainingQty: number
  unitCost: number
  createdAt: Date
}

type WeightedAverageInput = {
  currentStock: number
  currentUnitPrice: number
  incomingQuantity: number
  incomingUnitCost: number
}

export const calculateWeightedAveragePrice = (input: WeightedAverageInput) => {
  const currentValue = input.currentStock * input.currentUnitPrice
  const incomingValue = input.incomingQuantity * input.incomingUnitCost
  const totalQty = input.currentStock + input.incomingQuantity
  if (totalQty <= 0) return Number(input.currentUnitPrice.toFixed(2))
  return Number(((currentValue + incomingValue) / totalQty).toFixed(2))
}

export const buildFifoLotsFromMovements = (
  movements: InventoryMovementForValuation[],
  currentStock: number,
  fallbackUnitCost: number
) => {
  const lots: FifoLot[] = []

  for (const movement of movements) {
    if (movement.quantity > 0) {
      lots.push({
        remainingQty: movement.quantity,
        unitCost: movement.unitCost && movement.unitCost > 0 ? movement.unitCost : fallbackUnitCost,
        createdAt: movement.createdAt
      })
      continue
    }

    const quantityToConsume = Math.abs(movement.quantity)
    let remainingToConsume = quantityToConsume
    for (const lot of lots) {
      if (remainingToConsume <= 0) break
      if (lot.remainingQty <= 0) continue
      const consumed = Math.min(lot.remainingQty, remainingToConsume)
      lot.remainingQty -= consumed
      remainingToConsume -= consumed
    }
  }

  const totalLotsQty = lots.reduce((sum, lot) => sum + Math.max(0, lot.remainingQty), 0)
  const missingQty = currentStock - totalLotsQty
  if (missingQty > 0) {
    lots.push({
      remainingQty: missingQty,
      unitCost: fallbackUnitCost,
      createdAt: new Date(0)
    })
  }

  return lots
}

export const consumeFifoLots = (lots: FifoLot[], quantity: number) => {
  let remainingToConsume = quantity
  const clonedLots = lots.map(lot => ({ ...lot }))
  let totalCost = 0

  for (const lot of clonedLots) {
    if (remainingToConsume <= 0) break
    if (lot.remainingQty <= 0) continue
    const consumed = Math.min(lot.remainingQty, remainingToConsume)
    totalCost += consumed * lot.unitCost
    lot.remainingQty -= consumed
    remainingToConsume -= consumed
  }

  if (remainingToConsume > 0) {
    throw new Error('FIFO_STOCK_UNAVAILABLE')
  }

  return {
    totalCost: Number(totalCost.toFixed(2)),
    unitCost: Number((totalCost / quantity).toFixed(6)),
    remainingLots: clonedLots
  }
}
