import { describe, expect, it } from 'vitest'

import {
  buildFifoLotsFromMovements,
  consumeFifoLots,
  calculateWeightedAveragePrice,
  type InventoryMovementForValuation
} from '@/src/lib/inventory/valuation'

describe('inventory valuation', () => {
  it('consumes fifo lots by oldest entries first', () => {
    const movements: InventoryMovementForValuation[] = [
      { quantity: 10, unitCost: 20, createdAt: new Date('2026-08-10T10:00:00.000Z') },
      { quantity: 5, unitCost: 30, createdAt: new Date('2026-08-10T11:00:00.000Z') }
    ]

    const lots = buildFifoLotsFromMovements(movements, 15, 25)
    const result = consumeFifoLots(lots, 12)

    expect(result.totalCost).toBe(260)
    expect(result.unitCost).toBeCloseTo(21.666666, 5)
    expect(result.remainingLots.map(lot => lot.remainingQty)).toEqual([0, 3])
  })

  it('falls back to synthetic lot when stock has no entry history', () => {
    const lots = buildFifoLotsFromMovements([], 8, 14.5)
    const result = consumeFifoLots(lots, 3)
    expect(result.totalCost).toBe(43.5)
    expect(result.remainingLots[0]?.remainingQty).toBe(5)
  })

  it('calculates weighted average price for stock entries', () => {
    const nextPrice = calculateWeightedAveragePrice({
      currentStock: 20,
      currentUnitPrice: 10,
      incomingQuantity: 10,
      incomingUnitCost: 13
    })
    expect(nextPrice).toBe(11)
  })
})
