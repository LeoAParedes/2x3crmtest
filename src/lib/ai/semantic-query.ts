import { z } from 'zod'

import { parseBusinessDateMention } from '@/src/lib/ai/erp-db-harness'

export const semanticIntentSchema = z.enum([
  'product_sales',
  'product_stock',
  'product_sales_and_stock',
  'sales_summary',
  'inventory_summary',
  'cash_flow_summary',
  'clarify'
])

export const semanticMetricSchema = z.enum(['quantity', 'revenue', 'stock', 'low_stock', 'ticket_count'])

const isValidIsoDate = (value: string): boolean => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const semanticDateRangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('today') }).strict(),
  z.object({ kind: z.literal('yesterday') }).strict(),
  z.object({ kind: z.literal('week') }).strict(),
  z.object({ kind: z.literal('previous_week') }).strict(),
  z.object({ kind: z.literal('month') }).strict(),
  z.object({ kind: z.literal('rolling_days'), days: z.number().int().min(1).max(90) }).strict(),
  z.object({
    kind: z.literal('explicit_date'),
    date: z.string().refine(isValidIsoDate, 'Invalid calendar date')
  }).strict()
])

const semanticQueryFields = {
  dateRange: semanticDateRangeSchema,
  metrics: z.array(semanticMetricSchema).min(1).max(3)
}

export const semanticReadQuerySchema = z.discriminatedUnion('intent', [
  z
    .object({
      intent: z.enum(['product_sales', 'product_stock', 'product_sales_and_stock']),
      productQuery: z.string().min(1).max(120),
      ...semanticQueryFields
    })
    .strict(),
  z
    .object({
      intent: z.enum(['sales_summary', 'inventory_summary', 'cash_flow_summary', 'clarify']),
      ...semanticQueryFields
    })
    .strict()
])

export type SemanticIntent = z.infer<typeof semanticIntentSchema>
export type SemanticMetric = z.infer<typeof semanticMetricSchema>
export type SemanticDateRange = z.infer<typeof semanticDateRangeSchema>
export type SemanticReadQuery = z.infer<typeof semanticReadQuerySchema>

const MONTH_NAMES =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre'

const normalizeText = (message: string): string =>
  message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[¿?!.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const hasSalesSignal = (text: string): boolean =>
  /\b(vendieron?|vendio|vendimos|ventas?)\b/.test(text) || /\bse\s+vendio\b/.test(text)

const hasStockSignal = (text: string): boolean =>
  /\b(quedan?|stock|inventario)\b/.test(text) ||
  /\bcuantos?\s+hay\s+de\b/.test(text) ||
  /\bcuantas?\s+hay\s+de\b/.test(text) ||
  /\bhay\s+stock\b/.test(text) ||
  /\bcuanto\s+queda/.test(text)

const isSemanticMessage = (text: string): boolean =>
  hasSalesSignal(text) ||
  hasStockSignal(text) ||
  /\b(flujo|caja|ganancia|utilidad)\b/.test(text)

const parseDateRange = (message: string, now: Date): SemanticDateRange => {
  const text = normalizeText(message)

  const rollingMatch = text.match(/\bultim[oa]s?\s+(\d+)\s+dias\b/)
  if (rollingMatch) {
    return { kind: 'rolling_days', days: Math.min(Number(rollingMatch[1]), 90) }
  }

  if (/\b(la\s+)?semana\s+pasada\b/.test(text)) {
    return { kind: 'previous_week' }
  }

  if (/\besta\s+semana\b/.test(text)) {
    return { kind: 'week' }
  }

  if (/\beste\s+mes\b/.test(text)) {
    return { kind: 'month' }
  }

  if (/\bhoy\b/.test(text)) {
    return { kind: 'today' }
  }

  if (/\bayer\b/.test(text)) {
    return { kind: 'yesterday' }
  }

  const explicit = parseBusinessDateMention(message, now)
  if (explicit) {
    return { kind: 'explicit_date', date: explicit.isoDate }
  }

  return { kind: 'week' }
}

const stripDatePhrases = (text: string): string => {
  let stripped = text

  stripped = stripped.replace(/\bultim[oa]s?\s+\d+\s+dias\b/g, ' ')
  stripped = stripped.replace(/\b(la\s+)?semana\s+pasada\b/g, ' ')
  stripped = stripped.replace(/\besta\s+semana\b/g, ' ')
  stripped = stripped.replace(/\beste\s+mes\b/g, ' ')
  stripped = stripped.replace(/\bhoy\b/g, ' ')
  stripped = stripped.replace(/\bayer\b/g, ' ')
  stripped = stripped.replace(
    new RegExp(`\\b\\d{1,2}\\s+(?:de\\s+)?(?:${MONTH_NAMES})(?:\\s+de\\s+20\\d{2})?\\b`, 'g'),
    ' '
  )
  stripped = stripped.replace(new RegExp(`\\b(?:${MONTH_NAMES})\\s+\\d{1,2}\\b`, 'g'), ' ')
  stripped = stripped.replace(/\bel\s+\d{1,2}\s+de\s+\w+\b/g, ' ')
  stripped = stripped.replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, ' ')
  stripped = stripped.replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]20\d{2})?\b/g, ' ')

  return stripped.replace(/\s+/g, ' ').trim()
}

const extractProductQuery = (message: string): string => {
  let text = stripDatePhrases(normalizeText(message))

  const noisePatterns = [
    /\bcuanto\s+queda(?:n)?\b/g,
    /\bcuantos?\b/g,
    /\bcuantas?\b/g,
    /\bcuantos?\s+hay\b/g,
    /\bcuantas?\s+hay\b/g,
    /\bse\s+vendio\b/g,
    /\bvendieron?\b/g,
    /\bvendimos\b/g,
    /\bvendid[oa]s?\b/g,
    /\bventas?\s+de\b/g,
    /\bventas?\b/g,
    /\bqueda(?:n)?\b/g,
    /\bstock\b/g,
    /\binventario\b/g,
    /\bhay\b/g,
    /\bde\s+vendio\b/g,
    /\by\s+cuanto\b/g
  ]

  for (const pattern of noisePatterns) {
    text = text.replace(pattern, ' ')
  }

  text = text.replace(/\b(el|la|los|las|de|del|un|una|unos|unas|se|y|en|al|a)\b/g, ' ')

  return text.replace(/\s+/g, ' ').trim()
}

const resolveIntent = (text: string, productQuery: string): SemanticIntent => {
  const sales = hasSalesSignal(text)
  const stock = hasStockSignal(text)

  if (!productQuery) {
    if (sales || stock) return 'clarify'
    return 'sales_summary'
  }

  if (sales && stock) return 'product_sales_and_stock'
  if (stock) return 'product_stock'
  if (sales) return 'product_sales'

  return 'product_sales'
}

const deriveMetrics = (intent: SemanticIntent, text: string): SemanticMetric[] => {
  if (intent === 'product_sales_and_stock') {
    return ['quantity', 'stock']
  }

  if (intent === 'product_stock') {
    return ['stock']
  }

  if (intent === 'clarify') {
    return hasStockSignal(text) ? ['stock'] : ['quantity']
  }

  if (intent === 'product_sales') {
    const metrics: SemanticMetric[] = []

    if (/\b(cuantos?|cantidad|unidades?)\b/.test(text)) {
      metrics.push('quantity')
    }

    if (
      /\b(ingresos?|dinero)\b/.test(text) ||
      (/\bcuanto\b/.test(text) && !/\bqueda/.test(text) && !/\bcuantos?\b/.test(text))
    ) {
      metrics.push('revenue')
    }

    if (metrics.length === 0) {
      metrics.push('quantity')
    }

    return metrics.slice(0, 3)
  }

  return ['quantity']
}

export const normalizeSemanticQuery = (value: unknown): SemanticReadQuery =>
  semanticReadQuerySchema.parse(value)

export const parseDeterministicSemanticQuery = (
  message: string,
  now = new Date()
): SemanticReadQuery | null => {
  const trimmed = message.trim()
  if (!trimmed) return null

  const text = normalizeText(trimmed)
  if (!isSemanticMessage(text)) return null

  const dateRange = parseDateRange(trimmed, now)
  const productQuery = extractProductQuery(trimmed)
  const intent = resolveIntent(text, productQuery)
  const metrics = deriveMetrics(intent, text)

  const query = {
    intent,
    dateRange,
    metrics
  }

  if (productQuery && intent !== 'clarify') {
    return normalizeSemanticQuery({ ...query, productQuery })
  }

  return normalizeSemanticQuery(query)
}
