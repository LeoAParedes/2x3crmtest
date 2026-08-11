export type PromoCartLine = {
  inventoryItemId: string
  quantity: number
  unitPrice: number
  lineSubtotal: number
}

/**
 * Promo NxM/bundle rules count sellable units (pz or kg), not raw POS weight stock (grams).
 * Keep client and server aligned so cash totals match at checkout.
 */
export const toPromoQuantity = (quantity: number, unitMode: 'piece' | 'weight') => {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  if (unitMode === 'weight') {
    return Math.max(1, Math.round(quantity / 1000))
  }
  return Math.round(quantity)
}

export type PromoCandidate = {
  id: string
  name: string
  type: 'porcentaje' | 'monto_fijo' | '2x1' | '3x2' | 'bundle'
  value: number
  minPurchase: number
  productIds: string[]
  bundleItems: Array<{ inventoryItemId: string; requiredQty: number }>
}

export type PromoApplication = {
  promotionId: string
  promotionName: string
  discountTotal: number
  lineDiscounts: Record<string, number>
}

const money = (value: number) => Number(value.toFixed(2))

const allocateDiscountAcrossLines = (
  lines: PromoCartLine[],
  eligibleIds: Set<string>,
  discountTotal: number
) => {
  const lineDiscounts: Record<string, number> = {}
  const eligible = lines.filter(line => eligibleIds.has(line.inventoryItemId) && line.lineSubtotal > 0)
  const base = eligible.reduce((sum, line) => sum + line.lineSubtotal, 0)
  if (base <= 0 || discountTotal <= 0) return lineDiscounts

  let remaining = money(discountTotal)
  eligible.forEach((line, index) => {
    const share =
      index === eligible.length - 1
        ? remaining
        : money((discountTotal * line.lineSubtotal) / base)
    lineDiscounts[line.inventoryItemId] = money((lineDiscounts[line.inventoryItemId] || 0) + share)
    remaining = money(remaining - share)
  })
  return lineDiscounts
}

const computeNxMDiscount = (line: PromoCartLine, buy: number, pay: number) => {
  if (line.quantity < buy) return 0
  const groups = Math.floor(line.quantity / buy)
  const freeUnits = groups * (buy - pay)
  return money(freeUnits * line.unitPrice)
}

export const computePromotionDiscount = (
  promo: PromoCandidate,
  lines: PromoCartLine[]
): PromoApplication | null => {
  const cartSubtotal = money(lines.reduce((sum, line) => sum + line.lineSubtotal, 0))
  if (cartSubtotal < promo.minPurchase) return null

  if (promo.type === '2x1' || promo.type === '3x2') {
    const productSet = new Set(promo.productIds)
    if (productSet.size === 0) return null
    let discountTotal = 0
    const lineDiscounts: Record<string, number> = {}
    for (const line of lines) {
      if (!productSet.has(line.inventoryItemId)) continue
      const discount =
        promo.type === '2x1' ? computeNxMDiscount(line, 2, 1) : computeNxMDiscount(line, 3, 2)
      if (discount <= 0) continue
      lineDiscounts[line.inventoryItemId] = money(discount)
      discountTotal = money(discountTotal + discount)
    }
    if (discountTotal <= 0) return null
    return {
      promotionId: promo.id,
      promotionName: promo.name,
      discountTotal,
      lineDiscounts
    }
  }

  if (promo.type === 'bundle') {
    if (promo.bundleItems.length === 0) return null
    const qtyById = new Map(lines.map(line => [line.inventoryItemId, line.quantity]))
    let packs = Number.POSITIVE_INFINITY
    for (const item of promo.bundleItems) {
      const available = qtyById.get(item.inventoryItemId) || 0
      packs = Math.min(packs, Math.floor(available / item.requiredQty))
    }
    if (!Number.isFinite(packs) || packs <= 0) return null
    const discountTotal = money(packs * promo.value)
    const eligibleIds = new Set(promo.bundleItems.map(item => item.inventoryItemId))
    return {
      promotionId: promo.id,
      promotionName: promo.name,
      discountTotal,
      lineDiscounts: allocateDiscountAcrossLines(lines, eligibleIds, discountTotal)
    }
  }

  const productSet = new Set(promo.productIds)
  const eligibleLines =
    productSet.size === 0 ? lines : lines.filter(line => productSet.has(line.inventoryItemId))
  if (eligibleLines.length === 0) return null
  const eligibleSubtotal = money(eligibleLines.reduce((sum, line) => sum + line.lineSubtotal, 0))
  if (eligibleSubtotal <= 0) return null

  let discountTotal = 0
  if (promo.type === 'porcentaje') {
    discountTotal = money((eligibleSubtotal * Math.min(promo.value, 100)) / 100)
  } else if (promo.type === 'monto_fijo') {
    discountTotal = money(Math.min(promo.value, eligibleSubtotal))
  }
  if (discountTotal <= 0) return null

  return {
    promotionId: promo.id,
    promotionName: promo.name,
    discountTotal,
    lineDiscounts: allocateDiscountAcrossLines(
      lines,
      new Set(eligibleLines.map(line => line.inventoryItemId)),
      discountTotal
    )
  }
}

/** Pick the single promotion with the greatest customer savings. */
export const selectBestPromotion = (
  promos: PromoCandidate[],
  lines: PromoCartLine[]
): PromoApplication | null => {
  let best: PromoApplication | null = null
  for (const promo of promos) {
    const applied = computePromotionDiscount(promo, lines)
    if (!applied) continue
    if (!best || applied.discountTotal > best.discountTotal) {
      best = applied
    }
  }
  return best
}

export const applyDiscountToSaleTotals = (args: {
  subtotal: number
  tax: number
  discountTotal: number
}) => {
  const discountTotal = money(Math.max(0, Math.min(args.discountTotal, args.subtotal)))
  const taxableBase = money(Math.max(0, args.subtotal - discountTotal))
  const taxRatio = args.subtotal > 0 ? taxableBase / args.subtotal : 0
  const tax = money(args.tax * taxRatio)
  return {
    discountTotal,
    tax,
    total: money(taxableBase + tax)
  }
}
