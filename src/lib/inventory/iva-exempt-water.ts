/**
 * Mexican retail rule for this ERP: bottled drinking water is IVA-exempt (0%).
 * Uses product name/category heuristics; explicit InventoryItem.ivaRate still wins when set.
 */

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '')

const normalizeText = (value: string) => stripDiacritics(value).toLowerCase().trim()

/** Non-water products that mention "agua" in the name. */
const WATER_FALSE_POSITIVE =
  /\b(aguacate|agua\s+oxigenada|agua\s+de\s+colonia|agua\s+miel|en\s+agua|al\s+agua)\b/

/** Category named Agua / Bebidas de agua, etc. */
const WATER_CATEGORY = /^(agua|aguas|bebidas?\s+de\s+agua)$/

/**
 * Bottled / garrafón drinking water sold as a beverage product.
 * Matches: Agua purificada, Agua mineral, garrafón 20 L, etc.
 */
export const isIvaExemptWaterProduct = (
  productName: string,
  category = '',
  aisle: string | null | undefined = null
) => {
  const name = normalizeText(productName)
  const cat = normalizeText(category)
  const aisleText = normalizeText(aisle || '')

  if (!name && !cat) return false
  if (WATER_FALSE_POSITIVE.test(name)) return false

  if (WATER_CATEGORY.test(cat)) return true

  if (/\bgarrafon\b|\bbidon\b/.test(name) && /\bagua\b/.test(name)) return true
  if (/\bgarrafon\b/.test(name) && /bebida/.test(cat)) return true

  if (!/\bagua\b/.test(name)) return false

  // "Agua …" beverage SKUs (purificada, mineral, natural, sizes, garrafón)
  if (
    /(purificad|mineral|natural|embotellad|garrafon|bidon|\d+(?:[.,]\d+)?\s*(?:l|lt|lts|litro|litros|ml)\b)/.test(
      name
    )
  ) {
    return true
  }

  // Plain "Agua" / "Agua 600 ml" under Bebidas
  if (/^agua\b/.test(name) && /bebida/.test(cat)) return true

  // Aisle hint: Agua / Garrafones
  if (/^agua\b/.test(name) && /\b(agua|garrafon)/.test(aisleText)) return true

  return false
}

export type IvaRateSource = {
  productName: string
  category?: string
  aisle?: string | null
  ivaRate?: number | null
}

/**
 * Effective product IVA rate for POS/sale math.
 * - Drinking water (name/category rule) always resolves to 0
 * - Else explicit numeric ivaRate (including 0) wins
 * - Else null → caller uses PosSettings.defaultIvaRate
 */
export const resolveEffectiveIvaRate = (product: IvaRateSource): number | null => {
  if (isIvaExemptWaterProduct(product.productName, product.category || '', product.aisle)) {
    return 0
  }

  const raw = product.ivaRate
  if (raw !== null && raw !== undefined) {
    const numeric = Number(raw)
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric))
    }
  }

  return null
}

/** Suggested DB override when creating/importing a product. */
export const suggestedIvaRateForProduct = (
  productName: string,
  category = '',
  aisle: string | null | undefined = null
): number | null => {
  if (isIvaExemptWaterProduct(productName, category, aisle)) return 0
  return null
}
