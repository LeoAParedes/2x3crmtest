import { z } from 'zod'

export const openCashSessionSchema = z
  .object({
    openingFloat: z.number().min(0).max(1_000_000)
  })
  .strict()

export const closeCashSessionSchema = z
  .object({
    countedCash: z.number().min(0).max(1_000_000),
    notes: z.string().trim().max(500).optional()
  })
  .strict()

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>
