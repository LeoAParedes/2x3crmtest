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

export type IvaPolicy = {
  showIvaOnReceipt: boolean
  defaultIvaRate: number
}

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

export const resolveLineIvaRate = (
  productIvaRate: number | null | undefined,
  policy: IvaPolicy
) => {
  if (!policy.showIvaOnReceipt) return 0
  if (productIvaRate !== null && productIvaRate !== undefined && Number.isFinite(productIvaRate)) {
    return Math.max(0, Math.min(1, productIvaRate))
  }
  return Math.max(0, Math.min(1, policy.defaultIvaRate))
}

export const calculateLineTax = (lineSubtotal: number, ivaRate: number) =>
  Number((lineSubtotal * ivaRate).toFixed(2))

export type SaleLineInput = {
  quantity: number
  unitPrice: number
  unitMode?: 'piece' | 'weight'
  ivaRate?: number | null
}

export type SaleLineTotals = {
  lineSubtotal: number
  lineTax: number
  lineTotalWithTax: number
}

export const calculateLineTotals = (
  item: SaleLineInput,
  policy: IvaPolicy = { showIvaOnReceipt: false, defaultIvaRate: 0 }
): SaleLineTotals => {
  const lineSubtotal = calculateLineTotal(item.quantity, item.unitPrice, item.unitMode)
  const ivaRate = resolveLineIvaRate(item.ivaRate, policy)
  const lineTax = calculateLineTax(lineSubtotal, ivaRate)
  return {
    lineSubtotal,
    lineTax,
    lineTotalWithTax: Number((lineSubtotal + lineTax).toFixed(2))
  }
}

export const calculateSaleTotals = (
  items: SaleLineInput[],
  policy: IvaPolicy = { showIvaOnReceipt: false, defaultIvaRate: 0 }
) => {
  const lineTotals = items.map(item => calculateLineTotals(item, policy))
  const subtotal = Number(lineTotals.reduce((sum, line) => sum + line.lineSubtotal, 0).toFixed(2))
  const tax = Number(lineTotals.reduce((sum, line) => sum + line.lineTax, 0).toFixed(2))
  return {
    subtotal,
    tax,
    total: Number((subtotal + tax).toFixed(2)),
    lines: lineTotals
  }
}
