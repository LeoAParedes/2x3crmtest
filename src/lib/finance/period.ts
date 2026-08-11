export type FinancePeriod = 'day' | 'week' | 'month'

/** Business calendar uses US Pacific; each day starts at local midnight (00:00). */
export const FINANCE_TIME_ZONE = 'America/Los_Angeles'

const periodValues: FinancePeriod[] = ['day', 'week', 'month']

export const isFinancePeriod = (value: string | null | undefined): value is FinancePeriod =>
  typeof value === 'string' && periodValues.includes(value as FinancePeriod)

export const getTimeZoneParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  })

  const parts = formatter.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''

  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour: Number(read('hour')),
    minute: Number(read('minute')),
    second: Number(read('second')),
    weekday: read('weekday')
  }
}

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
}

/** Convert a wall-clock date/time in `timeZone` to a UTC Date. */
export const zonedWallTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone = FINANCE_TIME_ZONE
) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const parts = getTimeZoneParts(utcGuess, timeZone)
  const asUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const desiredMs = Date.UTC(year, month - 1, day, hour, minute, second)
  return new Date(utcGuess.getTime() + (desiredMs - asUtcMs))
}

export const getPeriodBounds = (period: FinancePeriod, now = new Date(), timeZone = FINANCE_TIME_ZONE) => {
  const parts = getTimeZoneParts(now, timeZone)
  const startOfToday = zonedWallTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, timeZone)

  if (period === 'day') {
    return { start: startOfToday, end: now }
  }

  if (period === 'week') {
    const weekday = weekdayIndex[parts.weekday] ?? 1
    const daysFromMonday = (weekday + 6) % 7
    const mondayUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysFromMonday))
    const start = zonedWallTimeToUtc(
      mondayUtc.getUTCFullYear(),
      mondayUtc.getUTCMonth() + 1,
      mondayUtc.getUTCDate(),
      0,
      0,
      0,
      timeZone
    )
    return { start, end: now }
  }

  const start = zonedWallTimeToUtc(parts.year, parts.month, 1, 0, 0, 0, timeZone)
  return { start, end: now }
}

export const getAllPeriodBounds = (now = new Date(), timeZone = FINANCE_TIME_ZONE) => ({
  day: getPeriodBounds('day', now, timeZone),
  week: getPeriodBounds('week', now, timeZone),
  month: getPeriodBounds('month', now, timeZone)
})

/** Calendar year-to-date from Jan 1 00:00 local through now. */
export const getYearBounds = (now = new Date(), timeZone = FINANCE_TIME_ZONE) => {
  const parts = getTimeZoneParts(now, timeZone)
  const start = zonedWallTimeToUtc(parts.year, 1, 1, 0, 0, 0, timeZone)
  return { start, end: now }
}

/** Previous complete calendar month in local time (1st 00:00 → last day 23:59:59). */
export const getPreviousMonthBounds = (now = new Date(), timeZone = FINANCE_TIME_ZONE) => {
  const parts = getTimeZoneParts(now, timeZone)
  const year = parts.month === 1 ? parts.year - 1 : parts.year
  const month = parts.month === 1 ? 12 : parts.month - 1
  const start = zonedWallTimeToUtc(year, month, 1, 0, 0, 0, timeZone)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = zonedWallTimeToUtc(nextYear, nextMonth, 1, 0, 0, 0, timeZone)
  return { start, end: new Date(end.getTime() - 1000) }
}

/** Previous complete calendar year (Jan 1 → Dec 31 local). */
export const getPreviousYearBounds = (now = new Date(), timeZone = FINANCE_TIME_ZONE) => {
  const parts = getTimeZoneParts(now, timeZone)
  const year = parts.year - 1
  const start = zonedWallTimeToUtc(year, 1, 1, 0, 0, 0, timeZone)
  const end = zonedWallTimeToUtc(year, 12, 31, 23, 59, 59, timeZone)
  return { start, end }
}

export const getCustomBounds = (fromDate: string, toDate: string, timeZone = FINANCE_TIME_ZONE) => {
  const fromParts = fromDate.split('-').map(Number)
  const toParts = toDate.split('-').map(Number)
  if (fromParts.length !== 3 || toParts.length !== 3) {
    throw new Error('INVALID_CUSTOM_RANGE')
  }
  const [fromYear, fromMonth, fromDay] = fromParts
  const [toYear, toMonth, toDay] = toParts
  if (![fromYear, fromMonth, fromDay, toYear, toMonth, toDay].every(Number.isFinite)) {
    throw new Error('INVALID_CUSTOM_RANGE')
  }

  const start = zonedWallTimeToUtc(fromYear, fromMonth, fromDay, 0, 0, 0, timeZone)
  const end = zonedWallTimeToUtc(toYear, toMonth, toDay, 23, 59, 59, timeZone)
  if (start.getTime() > end.getTime()) {
    throw new Error('INVALID_CUSTOM_RANGE_ORDER')
  }
  return { start, end }
}

/**
 * Rolling window ending now: includes today + (days-1) previous calendar days,
 * starting at local midnight of the first day (Pacific).
 */
export const getRollingBounds = (days: number, now = new Date(), timeZone = FINANCE_TIME_ZONE) => {
  /** Cap at 366 so AI “últimos N días” / year-ish windows stay bounded. */
  const safeDays = Math.max(1, Math.min(Math.floor(days), 366))
  const parts = getTimeZoneParts(now, timeZone)
  const startAnchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - (safeDays - 1)))
  const start = zonedWallTimeToUtc(
    startAnchor.getUTCFullYear(),
    startAnchor.getUTCMonth() + 1,
    startAnchor.getUTCDate(),
    0,
    0,
    0,
    timeZone
  )
  return { start, end: now, days: safeDays }
}

/** Prefer hourly buckets for a single calendar day; otherwise daily labels. */
export const resolveSeriesPeriod = (start: Date, end: Date, timeZone = FINANCE_TIME_ZONE): FinancePeriod => {
  const startParts = getTimeZoneParts(start, timeZone)
  const endParts = getTimeZoneParts(end, timeZone)
  const sameDay =
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day
  return sameDay ? 'day' : 'week'
}

export const CASH_FLOW_WINDOW_OPTIONS = [7, 15, 31] as const
export type CashFlowWindowDays = (typeof CASH_FLOW_WINDOW_OPTIONS)[number]

export const isCashFlowWindowDays = (value: unknown): value is CashFlowWindowDays =>
  typeof value === 'number' && (CASH_FLOW_WINDOW_OPTIONS as readonly number[]).includes(value)

/** Normalize persisted prefs that used calendar-style 30 → natural 31 days. */
export const normalizeCashFlowWindowDays = (value: unknown): CashFlowWindowDays => {
  if (value === 30) return 31
  if (isCashFlowWindowDays(value)) return value
  return 15
}

export const formatBucketKey = (date: Date, period: FinancePeriod, timeZone = FINANCE_TIME_ZONE) => {
  if (period === 'day') {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(date)
  }

  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    day: '2-digit',
    month: 'short'
  }).format(date)
}

export const buildBucketLabels = (period: FinancePeriod, start: Date, end: Date, timeZone = FINANCE_TIME_ZONE) => {
  const labels: string[] = []

  if (period === 'day') {
    const startParts = getTimeZoneParts(start, timeZone)
    const endParts = getTimeZoneParts(end, timeZone)
    for (let hour = 0; hour <= endParts.hour; hour += 1) {
      const point = zonedWallTimeToUtc(startParts.year, startParts.month, startParts.day, hour, 0, 0, timeZone)
      labels.push(formatBucketKey(point, period, timeZone))
    }
    return labels
  }

  let cursorParts = getTimeZoneParts(start, timeZone)
  const endParts = getTimeZoneParts(end, timeZone)

  while (true) {
    const point = zonedWallTimeToUtc(cursorParts.year, cursorParts.month, cursorParts.day, 12, 0, 0, timeZone)
    labels.push(formatBucketKey(point, period, timeZone))

    if (
      cursorParts.year === endParts.year &&
      cursorParts.month === endParts.month &&
      cursorParts.day === endParts.day
    ) {
      break
    }

    const next = new Date(Date.UTC(cursorParts.year, cursorParts.month - 1, cursorParts.day + 1))
    cursorParts = {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      weekday: ''
    }
  }

  return labels
}
