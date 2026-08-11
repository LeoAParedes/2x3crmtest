import { z } from 'zod'

export const createSaleSchema = z
  .object({
    items: z
      .array(
        z.object({
          inventoryItemId: z.string().cuid(),
          quantity: z.number().int().positive().max(999_000),
          unitMode: z.enum(['piece', 'weight']).default('piece')
        })
      )
      .min(1)
      .max(100),
    paymentMethod: z.enum(['cash', 'card']),
    amountReceived: z.number().nonnegative().optional()
  })
  .strict()

export type CreateSaleInput = z.infer<typeof createSaleSchema>

/** Weight quantities are stored in grams; billable qty is kilograms. */
export const toBillableQuantity = (quantity: number, unitMode: 'piece' | 'weight' = 'piece') => {
  if (unitMode === 'weight') {
    return Number((quantity / 1000).toFixed(3))
  }
  return quantity
}

export const calculateLineTotal = (
  quantity: number,
  unitPrice: number,
  unitMode: 'piece' | 'weight' = 'piece'
) => Number((unitPrice * toBillableQuantity(quantity, unitMode)).toFixed(2))

export const calculateSaleTotals = (
  items: Array<{ quantity: number; unitPrice: number; unitMode?: 'piece' | 'weight' }>
) => {
  const subtotal = Number(
    items
      .reduce((sum, item) => sum + calculateLineTotal(item.quantity, item.unitPrice, item.unitMode), 0)
      .toFixed(2)
  )
  const tax = 0
  return {
    subtotal,
    tax,
    total: Number((subtotal + tax).toFixed(2))
  }
}
