import { describe, expect, it } from 'vitest'

import {
  getRestockBillableQuantity,
  getRestockDeficit,
  getRestockEstimatedCost
} from '@/src/lib/inventory/low-stock'

describe('restock calculations', () => {
  it('computes deficit without off-by-one when stock is below minimum', () => {
    expect(getRestockDeficit(15_000, 20_000)).toBe(5_000)
  })

  it('returns zero deficit when stock equals minimum', () => {
    expect(getRestockDeficit(20_000, 20_000)).toBe(0)
  })

  it('converts weight deficit to kilograms for billing', () => {
    expect(getRestockBillableQuantity(5_000, true)).toBe(5)
    expect(getRestockBillableQuantity(4, false)).toBe(4)
  })

  it('estimates restock cost per kg for weight inventory', () => {
    expect(getRestockEstimatedCost(15_000, 20_000, 389, true)).toBe(1_945)
  })

  it('estimates restock cost per piece for piece inventory', () => {
    expect(getRestockEstimatedCost(8, 20, 12.5, false)).toBe(150)
  })
})
