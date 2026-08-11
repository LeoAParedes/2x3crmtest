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
  | { status: 'ambiguous'; count: number; samples: PosLookupProduct[]; candidates: PosLookupProduct[] }

/** Max products shown in cobro selectable search results. */
export const POS_CODE_LOOKUP_CANDIDATE_LIMIT = 20

/** Strip scanner noise (CR/LF/tabs) and normalize whitespace. */
export const normalizeProductCodeQuery = (raw: string) =>
  raw.replace(/[\r\n\t]+/g, '').trim()

/**
 * Rank inventory hits for browsing incomplete SKU / name in cobro mode.
 * Prefer SKU prefix, then name prefix, then other multi-field API hits.
 */
export const rankProductCodeCandidates = (
  code: string,
  items: PosLookupProduct[],
  limit = POS_CODE_LOOKUP_CANDIDATE_LIMIT
): PosLookupProduct[] => {
  const normalized = normalizeProductCodeQuery(code).toLowerCase()
  if (!normalized || !items.length) return []

  const skuExact: PosLookupProduct[] = []
  const nameExact: PosLookupProduct[] = []
  const skuPrefix: PosLookupProduct[] = []
  const namePrefix: PosLookupProduct[] = []
  const other: PosLookupProduct[] = []
  const seen = new Set<string>()

  const pushUnique = (bucket: PosLookupProduct[], item: PosLookupProduct) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    bucket.push(item)
  }

  for (const item of items) {
    const sku = item.sku.toLowerCase()
    const name = item.productName.toLowerCase()
    if (sku === normalized) {
      pushUnique(skuExact, item)
      continue
    }
    if (name === normalized) {
      pushUnique(nameExact, item)
      continue
    }
    if (sku.startsWith(normalized)) {
      pushUnique(skuPrefix, item)
      continue
    }
    if (name.startsWith(normalized) || name.includes(normalized)) {
      pushUnique(namePrefix, item)
      continue
    }
    pushUnique(other, item)
  }

  return [...skuExact, ...nameExact, ...skuPrefix, ...namePrefix, ...other].slice(0, limit)
}

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

  const candidates = rankProductCodeCandidates(code, ambiguousPool)
  return {
    status: 'ambiguous',
    count: ambiguousPool.length,
    samples: candidates.slice(0, 5),
    candidates
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
  return `Varios productos coinciden con “${displayCode}”. Selecciona uno de la lista${suffix}`
}
