import { z } from 'zod'

export const PROMO_TYPES = ['porcentaje', 'monto_fijo', '2x1', 'bundle'] as const
export type PromoType = (typeof PROMO_TYPES)[number]

export const createPromotionSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(PROMO_TYPES),
    value: z.number().nonnegative().max(100_000),
    minPurchase: z.number().nonnegative().max(1_000_000).default(0),
    description: z.string().trim().min(2).max(240),
    active: z.boolean().default(true),
    expiresAt: z.string().datetime({ offset: true }).optional().nullable()
  })
  .strict()

export const updatePromotionSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    type: z.enum(PROMO_TYPES).optional(),
    value: z.number().nonnegative().max(100_000).optional(),
    minPurchase: z.number().nonnegative().max(1_000_000).optional(),
    description: z.string().trim().min(2).max(240).optional(),
    active: z.boolean().optional(),
    expiresAt: z.string().datetime({ offset: true }).optional().nullable()
  })
  .strict()

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>
