/**
 * Shared POS product-by-code matching for traditional catalog search parity
 * and modo cobro scan/Enter workflows.
 */

export type PosLookupProduct = {
  id: string
  sku: string
  productName: string
  category: string
  stock: number
  unitPrice: number
  aisle: string | null
  supportsWeight: boolean
  ivaRate?: number | null
}

export type PosProductCodeMatch =
  | { status: 'found'; product: PosLookupProduct }
  | { status: 'not_found' }
  | { status: 'ambiguous'; count: number; samples: PosLookupProduct[] }

/** Strip scanner noise (CR/LF/tabs) and normalize whitespace. */
export const normalizeProductCodeQuery = (raw: string) =>
  raw.replace(/[\r\n\t]+/g, '').trim()

/**
 * Prefer exact SKU, then exact name, then a single confident partial.
 * Never auto-pick an arbitrary first row among many partial hits.
 */
export const pickBestProductCodeMatch = (
  code: string,
  items: PosLookupProduct[]
): PosProductCodeMatch => {
  const normalized = normalizeProductCodeQuery(code).toLowerCase()
  if (!normalized) return { status: 'not_found' }
  if (!items.length) return { status: 'not_found' }

  const exactSku = items.find(item => item.sku.toLowerCase() === normalized)
  if (exactSku) return { status: 'found', product: exactSku }

  const exactName = items.find(item => item.productName.toLowerCase() === normalized)
  if (exactName) return { status: 'found', product: exactName }

  const skuPrefixMatches = items.filter(item => item.sku.toLowerCase().startsWith(normalized))
  if (skuPrefixMatches.length === 1) {
    return { status: 'found', product: skuPrefixMatches[0] }
  }

  const namePrefixMatches = items.filter(item =>
    item.productName.toLowerCase().startsWith(normalized)
  )
  if (namePrefixMatches.length === 1 && skuPrefixMatches.length === 0) {
    return { status: 'found', product: namePrefixMatches[0] }
  }

  if (items.length === 1) return { status: 'found', product: items[0] }

  const ambiguousPool =
    skuPrefixMatches.length > 1
      ? skuPrefixMatches
      : namePrefixMatches.length > 1
        ? namePrefixMatches
        : items

  return {
    status: 'ambiguous',
    count: ambiguousPool.length,
    samples: ambiguousPool.slice(0, 5)
  }
}

/** Same multi-field inventory search traditional POS uses (no searchField). */
export const buildPosProductCodeSearchParams = (code: string) => {
  const normalized = normalizeProductCodeQuery(code)
  return new URLSearchParams({
    q: normalized,
    sortBy: 'sku',
    sortDirection: 'asc',
    page: '1',
    pageSize: '40'
  })
}

export const formatProductCodeLookupMessage = (
  code: string,
  match: PosProductCodeMatch
): string | null => {
  const displayCode = normalizeProductCodeQuery(code)
  if (match.status === 'found') return null
  if (match.status === 'not_found') {
    return `Sin producto para el código ${displayCode}`
  }
  const sampleLabels = match.samples
    .map(item => item.sku)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')
  const suffix = sampleLabels ? ` (ej. ${sampleLabels})` : ''
  return `Varios productos coinciden con “${displayCode}”. Usa el SKU completo${suffix}`
}
