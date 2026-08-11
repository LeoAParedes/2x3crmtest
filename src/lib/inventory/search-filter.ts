export const inventorySearchFields = [
  'category',
  'unitPrice',
  'sku',
  'productName',
  'unit',
  'stock'
] as const

export type InventorySearchField = (typeof inventorySearchFields)[number]

export type NumericSearchOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte'

export type NumericSearch = {
  operator: NumericSearchOperator
  value: number
}

/** Category/aisle tokens aligned with `inferWeightSupport`. */
const WEIGHT_SUPPORT_TOKENS = [
  'granel',
  'peso',
  'kg',
  'fruta',
  'verdura',
  'vegetal',
  'carn',
  'res',
  'pollo',
  'cerdo',
  'pesc',
  'marisc',
  'legumbr',
  'raiz',
  'raíz',
  'tuber',
  'tubér'
] as const

const WEIGHT_UNIT_ALIASES = new Set([
  'kg',
  'kilo',
  'kilos',
  'kilogramo',
  'kilogramos',
  'peso',
  'pesaje',
  'weight',
  'granel'
])

const PIECE_UNIT_ALIASES = new Set([
  'pz',
  'pza',
  'pzas',
  'pieza',
  'piezas',
  'piece',
  'pieces',
  'pieza(s)',
  'unidad',
  'unidades'
])

export const isInventorySearchField = (value: string | null | undefined): value is InventorySearchField =>
  Boolean(value && (inventorySearchFields as readonly string[]).includes(value))

export const parseNumericSearch = (raw: string): NumericSearch | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/\$/g, '').replace(/,/g, '').replace(/\s+/g, '')
  const match = /^(>=|<=|>|<|=)?(-?\d+(?:\.\d+)?)$/.exec(normalized)
  if (!match) return null

  const value = Number(match[2])
  if (!Number.isFinite(value)) return null

  const operatorToken = match[1] || '='
  const operator: NumericSearchOperator =
    operatorToken === '>'
      ? 'gt'
      : operatorToken === '>='
        ? 'gte'
        : operatorToken === '<'
          ? 'lt'
          : operatorToken === '<='
            ? 'lte'
            : 'eq'

  return { operator, value }
}

const buildNumericPrismaFilter = (field: 'unitPrice' | 'stock', search: NumericSearch) => {
  if (search.operator === 'eq') return { [field]: search.value }
  if (search.operator === 'gt') return { [field]: { gt: search.value } }
  if (search.operator === 'gte') return { [field]: { gte: search.value } }
  if (search.operator === 'lt') return { [field]: { lt: search.value } }
  return { [field]: { lte: search.value } }
}

const buildWeightUnitWhere = () => ({
  OR: WEIGHT_SUPPORT_TOKENS.flatMap(token => [
    { category: { contains: token, mode: 'insensitive' as const } },
    { aisle: { contains: token, mode: 'insensitive' as const } }
  ])
})

const buildPieceUnitWhere = () => ({
  NOT: buildWeightUnitWhere()
})

const resolveUnitPreference = (raw: string): 'weight' | 'piece' | null => {
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return null
  if (WEIGHT_UNIT_ALIASES.has(normalized)) return 'weight'
  if (PIECE_UNIT_ALIASES.has(normalized)) return 'piece'
  if (/(kg|kilo|peso|granel|weight)/.test(normalized)) return 'weight'
  if (/(pz|pieza|piece|unidad)/.test(normalized)) return 'piece'
  return null
}

/**
 * Builds a Prisma `where` fragment for inventory list search.
 * When `searchField` is omitted, keeps legacy multi-field token matching (POS).
 */
export const buildInventorySearchWhere = (query: string | null | undefined, searchField?: string | null) => {
  const trimmed = query?.trim() || ''
  if (!trimmed) return undefined

  if (!searchField || !isInventorySearchField(searchField)) {
    const queryTokens = trimmed
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean)

    if (queryTokens.length === 0) return undefined

    return {
      AND: queryTokens.map(token => ({
        OR: [
          { sku: { contains: token, mode: 'insensitive' as const } },
          { productName: { contains: token, mode: 'insensitive' as const } },
          { category: { contains: token, mode: 'insensitive' as const } }
        ]
      }))
    }
  }

  if (searchField === 'sku') {
    return { sku: { contains: trimmed, mode: 'insensitive' as const } }
  }

  if (searchField === 'productName') {
    return { productName: { contains: trimmed, mode: 'insensitive' as const } }
  }

  if (searchField === 'category') {
    return { category: { contains: trimmed, mode: 'insensitive' as const } }
  }

  if (searchField === 'unitPrice') {
    const numeric = parseNumericSearch(trimmed)
    if (!numeric) return { id: { in: [] as string[] } }
    return buildNumericPrismaFilter('unitPrice', numeric)
  }

  if (searchField === 'stock') {
    const numeric = parseNumericSearch(trimmed)
    if (!numeric) return { id: { in: [] as string[] } }
    return buildNumericPrismaFilter('stock', numeric)
  }

  const unitPreference = resolveUnitPreference(trimmed)
  if (unitPreference === 'weight') return buildWeightUnitWhere()
  if (unitPreference === 'piece') return buildPieceUnitWhere()
  return { id: { in: [] as string[] } }
}
