import {
  FINANCE_TIME_ZONE,
  getTimeZoneParts,
  zonedWallTimeToUtc
} from '@/src/lib/finance/period'

export type CashShiftSlot = 'morning' | 'afternoon'

export const resolveCashShiftSlot = (
  now = new Date(),
  timeZone = FINANCE_TIME_ZONE
): CashShiftSlot | null => {
  const parts = getTimeZoneParts(now, timeZone)
  const minutes = parts.hour * 60 + parts.minute
  const morningStart = 6 * 60
  const afternoonStart = 14 * 60
  const afternoonEnd = 22 * 60

  if (minutes >= morningStart && minutes < afternoonStart) return 'morning'
  if (minutes >= afternoonStart && minutes < afternoonEnd) return 'afternoon'
  return null
}

export const getShiftSlotBounds = (
  slot: CashShiftSlot,
  now = new Date(),
  timeZone = FINANCE_TIME_ZONE
) => {
  const parts = getTimeZoneParts(now, timeZone)
  if (slot === 'morning') {
    return {
      start: zonedWallTimeToUtc(parts.year, parts.month, parts.day, 6, 0, 0, timeZone),
      end: zonedWallTimeToUtc(parts.year, parts.month, parts.day, 13, 59, 59, timeZone)
    }
  }
  return {
    start: zonedWallTimeToUtc(parts.year, parts.month, parts.day, 14, 0, 0, timeZone),
    end: zonedWallTimeToUtc(parts.year, parts.month, parts.day, 21, 59, 59, timeZone)
  }
}

export const toBusinessDayKey = (date: Date, timeZone = FINANCE_TIME_ZONE) => {
  const parts = getTimeZoneParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}
