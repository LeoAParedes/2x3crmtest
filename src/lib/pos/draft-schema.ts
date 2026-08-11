import { z } from 'zod'

export const draftItemSchema = z
  .object({
    inventoryItemId: z.string().cuid(),
    sku: z.string().min(1).max(64),
    productName: z.string().min(1).max(160),
    unitPrice: z.coerce.number().nonnegative(),
    supportsWeight: z.boolean().optional(),
    ivaRate: z
      .union([z.number(), z.null()])
      .optional()
      .transform(value => {
        if (value === null || value === undefined) return null
        if (!Number.isFinite(value)) return null
        // Accept legacy percent values (e.g. 16) and canonicalize to fraction.
        const fraction = value > 1 ? value / 100 : value
        return Math.max(0, Math.min(1, fraction))
      }),
    unitMode: z.enum(['piece', 'weight']),
    quantityInput: z.string().max(24)
  })
  .transform(item => {
    const trimmedQty = item.quantityInput.trim()
    return {
      ...item,
      quantityInput:
        trimmedQty.length > 0 ? trimmedQty : item.unitMode === 'weight' ? '0.25' : '1'
    }
  })

export const draftPayloadSchema = z.object({
  cart: z.array(draftItemSchema).max(200),
  paymentMethod: z.enum(['cash', 'card', 'credit']),
  amountReceived: z.preprocess(value => {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const normalized = Number(value.replace(',', '.'))
      return Number.isFinite(normalized) ? normalized : value
    }
    return value
  }, z.union([z.number().nonnegative(), z.null()])),
  creditCustomerName: z.string().max(120).optional(),
  creditCustomerPhone: z.string().max(40).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional()
})

export type PosDraftPayload = z.infer<typeof draftPayloadSchema>
