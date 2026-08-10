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

export const calculateSaleTotals = (items: Array<{ quantity: number; unitPrice: number }>) => {
  const subtotal = Number(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0).toFixed(2))
  const tax = 0
  return {
    subtotal,
    tax,
    total: Number((subtotal + tax).toFixed(2))
  }
}
