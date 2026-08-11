export const GRAMS_PER_KG = 1000

/** Weight inventory is stored in grams; POS/import UIs speak kilograms. */
export const inferWeightSupport = (
  category: string,
  aisle: string | null | undefined,
  productName = ''
) => {
  const fingerprint = `${category} ${aisle || ''} ${productName}`.toLowerCase()
  // `\bres\b` = beef as a whole word. Bare `res` falsely matched "refresco" (BEB-004).
  return /(granel|\bpeso\b|\bkg\b|fruta|verdura|vegetal|carn|\bres\b|pollo|cerdo|pesc|marisc|legumbr|ra[ií]z|tub[eé]rc|salm[oó]n|filete|at[uú]n)/.test(
    fingerprint
  )
}

export const isKilogramUnit = (unitRaw: string) => {
  const normalized = unitRaw.trim().toLowerCase()
  return ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(normalized)
}

export const isGramUnit = (unitRaw: string) => {
  const normalized = unitRaw.trim().toLowerCase()
  return ['g', 'gr', 'gramo', 'gramos'].includes(normalized)
}

export const kilogramsToGrams = (kilograms: number) => Math.round(kilograms * GRAMS_PER_KG)

export const gramsToKilograms = (grams: number) => Number((grams / GRAMS_PER_KG).toFixed(3))

/**
 * CSV stock for `kg` is human kilograms; canonical DB stock is grams.
 * Gram units stay as grams. Piece/other units stay as piece counts.
 */
export const stockQuantityFromCsvUnit = (stock: number, unitRaw: string) => {
  if (!Number.isFinite(stock) || stock < 0) return 0
  if (isKilogramUnit(unitRaw)) return kilogramsToGrams(stock)
  return Math.round(stock)
}

/**
 * Legacy imports stored whole kilograms (e.g. 60) while POS deducts grams (2500).
 * Values below 1 kg in the gram scale are treated as legacy kilogram integers.
 */
export const isLegacyKilogramStock = (stock: number, supportsWeight: boolean) =>
  supportsWeight && Number.isFinite(stock) && stock > 0 && stock < GRAMS_PER_KG

export const toCanonicalWeightStock = (stock: number) => {
  const rounded = Math.max(0, Math.round(stock) || 0)
  if (rounded > 0 && rounded < GRAMS_PER_KG) return rounded * GRAMS_PER_KG
  return rounded
}

export const hasSufficientStock = (stock: number, requestedQuantity: number) =>
  stock >= requestedQuantity

export const WEIGHT_STOCK_NORMALIZED_ACTION = 'inventory.weight_stock.normalized'
