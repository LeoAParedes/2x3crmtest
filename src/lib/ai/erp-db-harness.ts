import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { executeErpTool, type ErpToolFactResult } from '@/src/lib/ai/erp-tool-executors'
import { type ErpToolId } from '@/src/lib/ai/erp-tool-ids'
import { parseAiPeriodFromText, toToolPeriodArgs } from '@/src/lib/ai/ai-date-range'
import { resolveExpenseCategoryFromText } from '@/src/lib/ai/erp-entity-catalog'
import { getPrisma } from '@/src/lib/db/prisma'
import {
  FINANCE_TIME_ZONE,
  getCustomBounds,
  getPeriodBounds,
  getTimeZoneParts,
  zonedWallTimeToUtc
} from '@/src/lib/finance/period'

export type ErpDbProvenance = {
  source: 'supabase_postgres'
  via: 'prisma'
  queriedAt: string
  timeZone: string
}

export type ErpDbSnapshot = {
  ok: boolean
  provenance: ErpDbProvenance
  salesCompletedTotal: number
  salesCompletedCount: number
  salesCompletedTodayTotal: number
  salesCompletedTodayCount: number
  expenseTotal: number
  expenseCount: number
  inventorySkuCount: number
  mismatches: string[]
}

export type BusinessDateMention = {
  label: string
  isoDate: string
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
}

const normalizeIntentText = (message: string): string =>
  message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[¿?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Business nouns/verbs — temporal words alone (hoy, semana, agosto…) are not enough. */
const ERP_SALES_SIGNAL =
  /\b(venta|ventas|ticket|tickets|ingreso|ingresos|vendi[oó]|vendieron|vendimos|vendid[oa]s?|cobro|cobros)\b/
const ERP_EXPENSE_SIGNAL =
  /\b(egreso|egresos|gasto|gastos|n[oó]mina|renta|proveedor|luz|agua|gas|pasivo|servicio|servicios|mantenimiento|transporte|pagu[eé]|pague|pagamos|pagado)\b/
const ERP_PROFIT_SIGNAL = /\b(ganancia|ganancias|utilidad|utilidades|pnl|p&l|flujo|caja|finanzas)\b/
const ERP_PAYROLL_SIGNAL =
  /\b(n[oó]mina|nomina|sueldos?|salarios?|emplead[oa]s?|cajeros?)\b/
const ERP_INVENTORY_SIGNAL =
  /\b(stock|inventario|sku|producto|productos|precio|low[\s-]?stock)\b/
const ERP_METRIC_SIGNAL =
  /\b(cu[aá]nto|cu[aá]ntos|cu[aá]ntas|total|promedio|top|ranking|qui[eé]n|quienes)\b/

const hasStrongErpNoun = (text: string): boolean =>
  ERP_SALES_SIGNAL.test(text) ||
  ERP_EXPENSE_SIGNAL.test(text) ||
  ERP_PROFIT_SIGNAL.test(text) ||
  ERP_PAYROLL_SIGNAL.test(text) ||
  ERP_INVENTORY_SIGNAL.test(text)

export const hasErpBusinessIntent = (message: string): boolean => {
  const text = normalizeIntentText(message)
  if (!text) return false
  return hasStrongErpNoun(text) || ERP_METRIC_SIGNAL.test(text)
}

/** "Qué día/hora es hoy" — clock/calendar ask without ERP nouns. */
const isNonBusinessClockQuestion = (text: string): boolean => {
  const asksClockOrCalendar =
    /\b(que|cual)\s+(dia|hora|fecha)\b/.test(text) ||
    /\b(dia|hora|fecha)\s+(es|son)\b/.test(text) ||
    /\bhora\s+actual\b/.test(text) ||
    /\bfecha\s+(de\s+)?hoy\b/.test(text) ||
    /\b(dia|hora)\s+y\s+(dia|hora)\b/.test(text)

  if (!asksClockOrCalendar) return false
  return !hasStrongErpNoun(text)
}

export const isErpDataQuestion = (message: string): boolean => {
  const text = normalizeIntentText(message)
  if (!text) return false
  if (isNonBusinessClockQuestion(text)) return false
  return hasErpBusinessIntent(text)
}

/** Wall-clock label for prompts (clock questions must not hit the DB harness). */
export const formatLocalBusinessNow = (
  now = new Date(),
  timeZone = FINANCE_TIME_ZONE
): string =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(now)

/** Resolve "ayer", "10 de agosto", "agosto 10", "2026-08-10" in America/Los_Angeles. */
export const parseBusinessDateMention = (
  message: string,
  now = new Date(),
  timeZone = FINANCE_TIME_ZONE
): BusinessDateMention | null => {
  const text = message.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const parts = getTimeZoneParts(now, timeZone)

  if (/\bayer\b/.test(text)) {
    const yesterday = zonedWallTimeToUtc(parts.year, parts.month, parts.day - 1, 12, 0, 0, timeZone)
    const y = getTimeZoneParts(yesterday, timeZone)
    const isoDate = `${y.year}-${String(y.month).padStart(2, '0')}-${String(y.day).padStart(2, '0')}`
    return { label: `ayer (${isoDate})`, isoDate }
  }

  const isoMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return { label: isoDate, isoDate }
  }

  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](20\d{2}))?\b/)
  if (slashMatch) {
    const day = Number(slashMatch[1])
    const month = Number(slashMatch[2])
    const year = slashMatch[3] ? Number(slashMatch[3]) : parts.year
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { label: isoDate, isoDate }
    }
  }

  for (const [name, month] of Object.entries(MONTHS)) {
    const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?${name}\\b`))
    if (dayFirst) {
      const day = Number(dayFirst[1])
      const yearMatch = text.match(/\b(20\d{2})\b/)
      const year = yearMatch ? Number(yearMatch[1]) : parts.year
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { label: `${day} de ${name} ${year}`, isoDate }
    }
    const monthFirst = text.match(new RegExp(`\\b${name}\\s+(\\d{1,2})\\b`))
    if (monthFirst) {
      const day = Number(monthFirst[1])
      const yearMatch = text.match(/\b(20\d{2})\b/)
      const year = yearMatch ? Number(yearMatch[1]) : parts.year
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { label: `${day} de ${name} ${year}`, isoDate }
    }
  }

  return null
}

export const stampErpDbProvenance = <T extends Record<string, unknown>>(facts: T): T & {
  provenance: ErpDbProvenance
} => {
  return {
    ...facts,
    provenance: {
      source: 'supabase_postgres',
      via: 'prisma',
      queriedAt: new Date().toISOString(),
      timeZone: FINANCE_TIME_ZONE
    }
  }
}

export const queryCompletedSalesForLocalDate = async (isoDate: string) => {
  const { start, end } = getCustomBounds(isoDate, isoDate)
  const prisma = await getPrisma()
  const result = await prisma.sale.aggregate({
    where: {
      status: 'completed',
      createdAt: { gte: start, lte: end }
    },
    _sum: { total: true },
    _count: { _all: true }
  })

  return stampErpDbProvenance({
    toolId: 'sales_total_on_date',
    totalSales: Number(Number(result._sum.total || 0).toFixed(2)),
    ticketCount: result._count._all,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    localDate: isoDate,
    source: 'Sale.status=completed'
  })
}

export const selectErpToolsForQuestion = (
  message: string,
  allowedTools: ErpToolId[]
): Array<{ toolId: ErpToolId; args: Record<string, unknown> }> => {
  const text = normalizeIntentText(message)
  const picks: Array<{ toolId: ErpToolId; args: Record<string, unknown> }> = []
  const allow = (id: ErpToolId, args: Record<string, unknown> = {}) => {
    if (!allowedTools.includes(id)) return
    if (picks.some(pick => pick.toolId === id)) return
    picks.push({ toolId: id, args })
  }

  // Clock/social phrasing must never map to sales tools because of bare "hoy".
  if (!hasErpBusinessIntent(message) || isNonBusinessClockQuestion(text)) {
    return picks
  }

  if (parseBusinessDateMention(message)) {
    return picks
  }

  const periodArgs = toToolPeriodArgs(parseAiPeriodFromText(message))
  const expenseCategory = resolveExpenseCategoryFromText(message)

  const wantsInventory = ERP_INVENTORY_SIGNAL.test(text) || /\bbajo\b/.test(text)
  const wantsPayroll =
    (/\bn[oó]mina\b/.test(text) || /\bnomina\b/.test(text) || /\bpersonal\b/.test(text) || /\bemplead/.test(text)) &&
    (/\bqui[eé]n\b/.test(text) || /\bquienes\b/.test(text) || /\best[aá]n?\b/.test(text) || /\blista\b/.test(text))
  const wantsCategoryExpense = Boolean(expenseCategory) && expenseCategory !== 'nomina'
  const wantsNominaPayments =
    expenseCategory === 'nomina' && /\b(cu[aá]nto|pagu|pagado|gaste|gasto)\b/.test(text)
  const wantsExpenses =
    (ERP_EXPENSE_SIGNAL.test(text) || wantsCategoryExpense) && !wantsPayroll
  const wantsProfit = ERP_PROFIT_SIGNAL.test(text)
  const wantsSales =
    ERP_SALES_SIGNAL.test(text) ||
    ((/\b(cu[aá]nto|cu[aá]ntos|cu[aá]ntas|total)\b/.test(text) || wantsProfit) &&
      !wantsExpenses &&
      !wantsPayroll &&
      !wantsCategoryExpense)
  const wantsTop = /\b(top|ranking|mas vendido)\b/.test(text)
  const wantsRecent = /\b(reciente|ultim|ticket|tickets|que se vendio)\b/.test(text)

  if (wantsPayroll) {
    allow('payroll_roster', periodArgs)
  }

  if (wantsCategoryExpense && expenseCategory) {
    allow('expenses_by_category', { ...periodArgs, category: expenseCategory })
  } else if (wantsNominaPayments) {
    allow('expenses_by_category', { ...periodArgs, category: 'nomina' })
  }

  if (wantsProfit) {
    allow('cash_flow_period', periodArgs)
  }

  if (wantsSales && !wantsProfit) {
    if (periodArgs.period === 'day') {
      allow('sales_total_today')
    } else {
      allow('sales_total_period', periodArgs)
    }
  }

  if (wantsExpenses && !wantsCategoryExpense && !wantsNominaPayments) {
    allow('expenses_total_period', periodArgs)
  }

  if (wantsTop) {
    allow('top_product_period', { ...periodArgs, limit: 5 })
  }
  if (wantsRecent && wantsSales) {
    allow('recent_pos_sales', { ...periodArgs, limit: 8 })
  }
  if (wantsInventory) {
    allow('inventory_snapshot')
    allow('low_stock_count')
  }

  if (picks.length === 0 && allowedTools.length > 0) {
    if (allowedTools.includes('sales_total_today')) allow('sales_total_today')
    if (allowedTools.includes('sales_total_period')) allow('sales_total_period', { period: 'week' })
    if (allowedTools.includes('inventory_snapshot')) allow('inventory_snapshot')
  }

  return picks.slice(0, 4)
}

export const collectErpToolFacts = async (
  message: string,
  allowedTools: ErpToolId[]
): Promise<{ results: ErpToolFactResult[]; usedTools: string[] }> => {
  const selections = selectErpToolsForQuestion(message, allowedTools)
  const results: ErpToolFactResult[] = []
  const usedTools: string[] = []

  for (const selection of selections) {
    const result = await executeErpTool(selection.toolId, selection.args, allowedTools)
    results.push(result)
    usedTools.push(selection.toolId)
  }

  return { results, usedTools }
}

const money = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return null
  return amount.toFixed(2)
}

export const formatDeterministicErpReply = (results: ErpToolFactResult[]): string => {
  const okResults = results.filter(result => result.ok)
  if (okResults.length === 0) {
    return 'No pude obtener datos frescos de la base de datos (Supabase/Postgres). Intenta de nuevo en un momento.'
  }

  const lines: string[] = []
  for (const result of okResults) {
    if (!result.ok) continue
    const facts = result.facts
    if (result.toolId === 'sales_total_on_date') {
      lines.push(
        `Ventas ${String(facts.localDate || facts.label || 'fecha')}: $${money(facts.totalSales) ?? '0.00'} | tickets: ${String(facts.ticketCount ?? 0)} (${FINANCE_TIME_ZONE})`
      )
      continue
    }
    if (result.toolId === 'sales_total_today') {
      lines.push(
        `Ventas hoy (${FINANCE_TIME_ZONE}): $${money(facts.totalSales) ?? '0.00'} | tickets: ${String(facts.ticketCount ?? 0)}`
      )
      const last = facts.lastCompletedSale as
        | { saleNumber?: string; total?: number; createdAt?: string }
        | null
        | undefined
      if (facts.ticketCount === 0 && last?.saleNumber) {
        lines.push(
          `Ultima venta completed fuera de hoy: ${last.saleNumber} $${money(last.total) ?? '?'} (${last.createdAt || 'N/A'})`
        )
      }
      continue
    }
    if (result.toolId === 'sales_total_period') {
      lines.push(
        `Ventas ${String(facts.period)}: $${money(facts.totalSales) ?? '0.00'} | tickets: ${String(facts.ticketCount ?? 0)}`
      )
      continue
    }
    if (result.toolId === 'cash_flow_period') {
      lines.push(
        `P&L ${String(facts.periodLabel || facts.period)}: ingresos $${money(facts.ingresos) ?? '0.00'} - egresos $${money(facts.egresos) ?? '0.00'} = ganancia $${money(facts.ganancia) ?? '0.00'}`
      )
      continue
    }
    if (result.toolId === 'expenses_total_period') {
      lines.push(
        `Egresos ${String(facts.periodLabel || facts.period)}: $${money(facts.totalExpenses) ?? '0.00'} (${String(facts.expenseCount ?? 0)} registros)`
      )
      continue
    }
    if (result.toolId === 'expenses_by_category') {
      lines.push(
        `${String(facts.categoryLabel || facts.category)} ${String(facts.periodLabel || facts.period)}: $${money(facts.totalPaid) ?? '0.00'} (${String(facts.expenseCount ?? 0)} pagos)`
      )
      continue
    }
    if (result.toolId === 'payroll_roster') {
      const staff = Array.isArray(facts.activeStaff) ? facts.activeStaff : []
      const names = staff
        .slice(0, 8)
        .map(row => {
          const person = row as { username?: string; role?: string }
          return `${person.username || '?'} (${person.role || '?'})`
        })
        .join(', ')
      lines.push(
        `Nómina / personal activo: ${String(facts.activeStaffCount ?? 0)} — ${names || 'sin perfiles activos'}`
      )
      lines.push(
        `Pagos nómina ${String(facts.periodLabel || facts.period)}: $${money(facts.payrollExpenseTotal) ?? '0.00'} (${String(facts.payrollExpenseCount ?? 0)} registros)`
      )
      continue
    }
    if (result.toolId === 'inventory_snapshot') {
      lines.push(
        `Inventario: ${String(facts.skuCount ?? 0)} SKU | unidades ${String(facts.totalUnits ?? 0)} | stock bajo ${String(facts.lowStockCount ?? 0)}`
      )
      continue
    }
    if (result.toolId === 'low_stock_count') {
      lines.push(`Stock bajo: ${String(facts.lowStockCount ?? 0)} de ${String(facts.inventoryCount ?? 0)} SKU`)
      continue
    }
    if (result.toolId === 'recent_pos_sales') {
      const sales = Array.isArray(facts.sales) ? facts.sales : []
      if (sales.length === 0) {
        lines.push(`Ventas POS recientes (${String(facts.period)}): ninguna completed en el rango`)
      } else {
        const sample = sales
          .slice(0, 3)
          .map(row => {
            const sale = row as { saleNumber?: string; total?: number }
            return `${sale.saleNumber || '?'} $${money(sale.total) ?? '?'}`
          })
          .join(' | ')
        lines.push(`Ventas POS recientes: ${sample}`)
      }
      continue
    }
    if (result.toolId === 'top_product_period') {
      const top = facts.topProduct as
        | { productName?: string; quantityDisplay?: string; revenue?: number }
        | null
        | undefined
      if (!top) {
        lines.push(`Top productos (${String(facts.period)}): sin ventas completed en el rango`)
      } else {
        lines.push(
          `Top producto (${String(facts.period)}): ${top.productName || '?'} ${top.quantityDisplay || ''} | $${money(top.revenue) ?? '?'}`
        )
      }
    }
  }

  lines.push('Fuente: Supabase Postgres (Sale/Expense/InventoryItem).')
  return lines.join('\n')
}

export const runDeterministicErpDbReply = async (
  message: string,
  allowedTools: ErpToolId[]
): Promise<{ reply: string; usedTools: string[]; results: ErpToolFactResult[] }> => {
  const mentioned = parseBusinessDateMention(message)
  if (mentioned) {
    const facts = await queryCompletedSalesForLocalDate(mentioned.isoDate)
    const result = {
      toolId: 'sales_total_on_date' as const,
      ok: true as const,
      facts: {
        ...facts,
        label: mentioned.label,
        localDate: mentioned.label
      }
    } satisfies ErpToolFactResult
    return {
      reply: formatDeterministicErpReply([result]),
      usedTools: ['sales_total_on_date'],
      results: [result]
    }
  }

  const { results, usedTools } = await collectErpToolFacts(message, allowedTools)
  return {
    reply: formatDeterministicErpReply(results),
    usedTools,
    results
  }
}

export const verifyErpDbHarness = async (): Promise<ErpDbSnapshot> => {
  const prisma = await getPrisma()
  const provenance: ErpDbProvenance = {
    source: 'supabase_postgres',
    via: 'prisma',
    queriedAt: new Date().toISOString(),
    timeZone: FINANCE_TIME_ZONE
  }

  const day = getPeriodBounds('day')
  const [allSales, todaySales, expenses, inventoryCount] = await Promise.all([
    prisma.sale.aggregate({
      where: { status: 'completed' },
      _sum: { total: true },
      _count: { _all: true }
    }),
    prisma.sale.aggregate({
      where: {
        status: 'completed',
        createdAt: { gte: day.start, lte: day.end }
      },
      _sum: { total: true },
      _count: { _all: true }
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.inventoryItem.count()
  ])

  const allowed = ['sales_total_today', 'sales_total_period', 'inventory_snapshot'] as ErpToolId[]
  const salesTool = await executeErpTool('sales_total_today', {}, allowed)
  const weekTool = await executeErpTool('sales_total_period', { period: 'week' }, allowed)
  const inventoryTool = await executeErpTool('inventory_snapshot', {}, allowed)

  const mismatches: string[] = []
  const todayTotal = Number(todaySales._sum.total || 0)
  const todayCount = todaySales._count._all

  if (salesTool.ok) {
    if (Number(salesTool.facts.totalSales) !== Number(todayTotal.toFixed(2))) {
      mismatches.push(
        `sales_total_today.totalSales tool=${String(salesTool.facts.totalSales)} db=${todayTotal.toFixed(2)}`
      )
    }
    if (Number(salesTool.facts.ticketCount) !== todayCount) {
      mismatches.push(
        `sales_total_today.ticketCount tool=${String(salesTool.facts.ticketCount)} db=${todayCount}`
      )
    }
  } else {
    mismatches.push(`sales_total_today failed: ${salesTool.error}`)
  }

  if (inventoryTool.ok) {
    if (Number(inventoryTool.facts.skuCount) !== inventoryCount) {
      mismatches.push(
        `inventory_snapshot.skuCount tool=${String(inventoryTool.facts.skuCount)} db=${inventoryCount}`
      )
    }
  } else {
    mismatches.push(`inventory_snapshot failed: ${inventoryTool.error}`)
  }

  if (!weekTool.ok) {
    mismatches.push(`sales_total_period(week) failed: ${weekTool.error}`)
  }

  // #region agent log
  try {
    const body = {
      sessionId: '449600',
      runId: 'db-harness-verify',
      hypothesisId: 'H1',
      location: 'src/lib/ai/erp-db-harness.ts:verifyErpDbHarness',
      message: 'harness snapshot vs tools',
      timestamp: Date.now(),
      data: { mismatches, todayTotal, todayCount, inventoryCount }
    }
    appendFileSync(resolve(process.cwd(), '..', 'debug-449600.log'), `${JSON.stringify(body)}\n`)
  } catch {
    // ignore
  }
  // #endregion

  return {
    ok: mismatches.length === 0,
    provenance,
    salesCompletedTotal: Number(Number(allSales._sum.total || 0).toFixed(2)),
    salesCompletedCount: allSales._count._all,
    salesCompletedTodayTotal: Number(todayTotal.toFixed(2)),
    salesCompletedTodayCount: todayCount,
    expenseTotal: Number(Number(expenses._sum.amount || 0).toFixed(2)),
    expenseCount: expenses._count._all,
    inventorySkuCount: inventoryCount,
    mismatches
  }
}
