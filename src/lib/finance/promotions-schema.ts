import { z } from 'zod'

export const PROMO_TYPES = ['porcentaje', 'monto_fijo', '2x1', '3x2', 'bundle'] as const
export type PromoType = (typeof PROMO_TYPES)[number]

export const productRefSchema = z.object({
  inventoryItemId: z.string().min(1),
  requiredQty: z.number().int().positive().max(1_000_000).optional()
})

export type PromotionProductRef = z.infer<typeof productRefSchema>

export const createPromotionSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(PROMO_TYPES),
    value: z.number().nonnegative().max(100_000),
    minPurchase: z.number().nonnegative().max(1_000_000).default(0),
    description: z.string().trim().min(2).max(240),
    active: z.boolean().default(true),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
    productIds: z.array(z.string().min(1)).max(200).default([]),
    bundleItems: z
      .array(
        z.object({
          inventoryItemId: z.string().min(1),
          requiredQty: z.number().int().positive().max(1_000_000)
        })
      )
      .max(50)
      .default([])
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === 'bundle') {
      if (value.bundleItems.length < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'BUNDLE_REQUIRES_ITEMS',
          path: ['bundleItems']
        })
      }
      if (value.value <= 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'BUNDLE_REQUIRES_FIXED_DISCOUNT',
          path: ['value']
        })
      }
      return
    }

    if ((value.type === '2x1' || value.type === '3x2') && value.productIds.length < 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'PROMO_REQUIRES_PRODUCTS',
        path: ['productIds']
      })
    }
  })

export const updatePromotionSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    type: z.enum(PROMO_TYPES).optional(),
    value: z.number().nonnegative().max(100_000).optional(),
    minPurchase: z.number().nonnegative().max(1_000_000).optional(),
    description: z.string().trim().min(2).max(240).optional(),
    active: z.boolean().optional(),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
    productIds: z.array(z.string().min(1)).max(200).optional(),
    bundleItems: z
      .array(
        z.object({
          inventoryItemId: z.string().min(1),
          requiredQty: z.number().int().positive().max(1_000_000)
        })
      )
      .max(50)
      .optional()
  })
  .strict()

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>
