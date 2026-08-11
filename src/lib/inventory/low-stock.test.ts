import { describe, expect, it } from 'vitest'

import {
  getRestockBillableQuantity,
  getRestockDeficit,
  getRestockEstimatedCost,
  isArchivedInventoryItem,
  isLowStockItem
} from '@/src/lib/inventory/low-stock'

describe('archived inventory alerts', () => {
  it('detects archived aisle, sku suffix, and name marker', () => {
    expect(isArchivedInventoryItem({ aisle: '__archived__' })).toBe(true)
    expect(isArchivedInventoryItem({ aisle: ' __ARCHIVED__ ' })).toBe(true)
    expect(isArchivedInventoryItem({ aisle: 'A1', sku: 'ABA-007-archived-20260810' })).toBe(true)
    expect(isArchivedInventoryItem({ aisle: null, sku: 'X-ARCHIVED-1' })).toBe(true)
    expect(
      isArchivedInventoryItem({ aisle: null, productName: 'Aceite de oliva 500 ml [Archivado]' })
    ).toBe(true)
    expect(isArchivedInventoryItem({ aisle: 'A1', sku: 'ABA-007', productName: 'Aceite' })).toBe(false)
  })

  it('does not treat archived products as low-stock alerts', () => {
    expect(
      isLowStockItem({
        stock: 0,
        minStock: 20,
        aisle: '__archived__'
      })
    ).toBe(false)
    expect(
      isLowStockItem({
        stock: 0,
        minStock: 20,
        aisle: null,
        sku: 'X-archived-1',
        productName: 'X [Archivado]'
      })
    ).toBe(false)
  })

  it('still flags active products below minimum stock', () => {
    expect(isLowStockItem({ stock: 0, minStock: 20, aisle: null })).toBe(true)
  })
})

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
