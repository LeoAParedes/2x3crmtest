import {
  FINANCE_TIME_ZONE,
  getCustomBounds,
  getPeriodBounds,
  getPreviousMonthBounds,
  getPreviousYearBounds,
  getRollingBounds,
  getTimeZoneParts,
  getYearBounds,
  type FinancePeriod
} from '@/src/lib/finance/period'

/** Tool/arg period kinds the ERP harness accepts beyond classic day|week|month. */
export const AI_PERIOD_KINDS = [
  'day',
  'week',
  'month',
  'year',
  'last_month',
  'last_year',
  'rolling'
] as const

export type AiPeriodKind = (typeof AI_PERIOD_KINDS)[number]

export type ResolvedAiDateRange = {
  kind: AiPeriodKind | 'custom'
  label: string
  start: Date
  end: Date
  rollingDays?: number
  /** Classic finance period for dashboards that still need one (series buckets). */
  financePeriod: FinancePeriod
}

export const isAiPeriodKind = (value: unknown): value is AiPeriodKind =>
  typeof value === 'string' && (AI_PERIOD_KINDS as readonly string[]).includes(value)

const isoDate = (date: Date, timeZone = FINANCE_TIME_ZONE) => {
  const parts = getTimeZoneParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

const rangeLabel = (kind: AiPeriodKind | 'custom', start: Date, end: Date, rollingDays?: number) => {
  const from = isoDate(start)
  const to = isoDate(end)
  if (kind === 'rolling' && rollingDays) {
    return `últimos ${rollingDays} días (${from} → ${to})`
  }
  if (kind === 'last_month') return `mes pasado (${from} → ${to})`
  if (kind === 'last_year') return `año pasado (${from} → ${to})`
  if (kind === 'year') return `este año (${from} → ${to})`
  if (kind === 'month') return `este mes (${from} → ${to})`
  if (kind === 'week') return `esta semana (${from} → ${to})`
  if (kind === 'day') return `hoy (${from})`
  return `${from} → ${to}`
}

const toFinancePeriod = (kind: AiPeriodKind | 'custom', start: Date, end: Date): FinancePeriod => {
  if (kind === 'day' || kind === 'week' || kind === 'month') return kind
  const ms = end.getTime() - start.getTime()
  if (ms <= 36 * 60 * 60 * 1000) return 'day'
  return 'week'
}

export const resolveAiPeriodKind = (
  kind: AiPeriodKind,
  now = new Date(),
  rollingDays = 31
): ResolvedAiDateRange => {
  if (kind === 'day' || kind === 'week' || kind === 'month') {
    const bounds = getPeriodBounds(kind, now)
    return {
      kind,
      label: rangeLabel(kind, bounds.start, bounds.end),
      start: bounds.start,
      end: bounds.end,
      financePeriod: kind
    }
  }

  if (kind === 'year') {
    const bounds = getYearBounds(now)
    return {
      kind,
      label: rangeLabel(kind, bounds.start, bounds.end),
      start: bounds.start,
      end: bounds.end,
      financePeriod: 'week'
    }
  }

  if (kind === 'last_month') {
    const bounds = getPreviousMonthBounds(now)
    return {
      kind,
      label: rangeLabel(kind, bounds.start, bounds.end),
      start: bounds.start,
      end: bounds.end,
      financePeriod: 'week'
    }
  }

  if (kind === 'last_year') {
    const bounds = getPreviousYearBounds(now)
    return {
      kind,
      label: rangeLabel(kind, bounds.start, bounds.end),
      start: bounds.start,
      end: bounds.end,
      financePeriod: 'week'
    }
  }

  const bounds = getRollingBounds(rollingDays, now)
  return {
    kind: 'rolling',
    label: rangeLabel('rolling', bounds.start, bounds.end, bounds.days),
    start: bounds.start,
    end: bounds.end,
    rollingDays: bounds.days,
    financePeriod: 'week'
  }
}

export type AiDateRangeArgs = {
  period?: unknown
  rollingDays?: unknown
  fromDate?: unknown
  toDate?: unknown
}

/** Resolve tool args (period / rollingDays / fromDate+toDate) to concrete bounds. */
export const resolveAiDateRangeFromArgs = (
  args: AiDateRangeArgs,
  fallback: AiPeriodKind = 'month',
  now = new Date()
): ResolvedAiDateRange => {
  const fromDate = typeof args.fromDate === 'string' ? args.fromDate : null
  const toDate = typeof args.toDate === 'string' ? args.toDate : null
  if (fromDate && toDate) {
    const bounds = getCustomBounds(fromDate, toDate)
    return {
      kind: 'custom',
      label: rangeLabel('custom', bounds.start, bounds.end),
      start: bounds.start,
      end: bounds.end,
      financePeriod: toFinancePeriod('custom', bounds.start, bounds.end)
    }
  }

  const period = isAiPeriodKind(args.period) ? args.period : fallback
  const rollingDays =
    typeof args.rollingDays === 'number' && Number.isFinite(args.rollingDays)
      ? args.rollingDays
      : 31
  return resolveAiPeriodKind(period, now, rollingDays)
}

const normalizeText = (message: string): string =>
  message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[¿?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Parse natural-language Spanish periods for ERP questions.
 * Examples: este año, último mes, mes pasado, últimos 15 días, esta semana, hoy.
 */
export const parseAiPeriodFromText = (
  message: string,
  now = new Date()
): ResolvedAiDateRange => {
  const text = normalizeText(message)

  const rollingMatch = text.match(/\bultim[oa]s?\s+(\d+)\s+dias\b/)
  if (rollingMatch) {
    return resolveAiPeriodKind('rolling', now, Number(rollingMatch[1]))
  }

  if (/\b(el\s+)?ano\s+pasad[oa]\b/.test(text) || /\bano\s+anterior\b/.test(text)) {
    return resolveAiPeriodKind('last_year', now)
  }

  if (/\beste\s+ano\b/.test(text) || /\bdel\s+ano\b/.test(text) || /\ben\s+el\s+ano\b/.test(text)) {
    return resolveAiPeriodKind('year', now)
  }

  if (/\b(el\s+)?mes\s+pasad[oa]\b/.test(text) || /\bmes\s+anterior\b/.test(text)) {
    return resolveAiPeriodKind('last_month', now)
  }

  // "último mes" ≈ rolling ~31 days (aligns with periodos UI), not necessarily calendar MTD
  if (/\bultim[oa]\s+mes\b/.test(text) || /\bultimos?\s+30\s+dias\b/.test(text) || /\bultimos?\s+31\s+dias\b/.test(text)) {
    return resolveAiPeriodKind('rolling', now, 31)
  }

  if (/\beste\s+mes\b/.test(text)) {
    return resolveAiPeriodKind('month', now)
  }

  if (/\b(la\s+)?semana\s+pasada\b/.test(text)) {
    return resolveAiPeriodKind('rolling', now, 7)
  }

  if (/\besta\s+semana\b/.test(text) || /\bsemana\b/.test(text)) {
    return resolveAiPeriodKind('week', now)
  }

  if (/\bhoy\b/.test(text)) {
    return resolveAiPeriodKind('day', now)
  }

  if (/\bano\b/.test(text)) {
    return resolveAiPeriodKind('year', now)
  }

  if (/\bmes\b/.test(text)) {
    return resolveAiPeriodKind('rolling', now, 31)
  }

  return resolveAiPeriodKind('month', now)
}

/** Map a resolved range to the OpenAI tool `period` arg (+ optional rollingDays). */
export const toToolPeriodArgs = (
  range: ResolvedAiDateRange
): { period: AiPeriodKind; rollingDays?: number; fromDate?: string; toDate?: string } => {
  if (range.kind === 'custom') {
    return {
      period: 'month',
      fromDate: isoDate(range.start),
      toDate: isoDate(range.end)
    }
  }
  if (range.kind === 'rolling') {
    return { period: 'rolling', rollingDays: range.rollingDays || 31 }
  }
  return { period: range.kind }
}
