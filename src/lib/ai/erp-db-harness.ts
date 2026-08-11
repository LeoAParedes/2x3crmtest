import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { executeErpTool, type ErpToolFactResult } from '@/src/lib/ai/erp-tool-executors'
import { type ErpToolId } from '@/src/lib/ai/erp-tool-ids'
import { getPrisma } from '@/src/lib/db/prisma'
import { FINANCE_TIME_ZONE, getPeriodBounds } from '@/src/lib/finance/period'

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

const ERP_DATA_PATTERN =
  /\b(venta|ventas|ticket|tickets|ingreso|ingresos|egreso|egresos|gasto|gastos|ganancia|utilidad|pnl|p&l|flujo|caja|stock|inventario|sku|producto|productos|precio|low[\s-]?stock|bajo|n[oó]mina|renta|proveedor|finanzas|cu[aá]nto|total|promedio|top|ranking|hoy|semana|mes|periodo)\b/i

export const isErpDataQuestion = (message: string): boolean => {
  const text = message.trim()
  if (!text) return false
  return ERP_DATA_PATTERN.test(text)
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

export const selectErpToolsForQuestion = (
  message: string,
  allowedTools: ErpToolId[]
): Array<{ toolId: ErpToolId; args: Record<string, unknown> }> => {
  const text = message.toLowerCase()
  const picks: Array<{ toolId: ErpToolId; args: Record<string, unknown> }> = []
  const allow = (id: ErpToolId, args: Record<string, unknown> = {}) => {
    if (!allowedTools.includes(id)) return
    if (picks.some(pick => pick.toolId === id)) return
    picks.push({ toolId: id, args })
  }

  const wantsInventory =
    /\b(stock|inventario|sku|producto|productos|low[\s-]?stock|bajo)\b/.test(text)
  const wantsExpenses = /\b(egreso|egresos|gasto|gastos|n[oó]mina|renta|proveedor)\b/.test(text)
  const wantsProfit = /\b(ganancia|utilidad|pnl|p&l|flujo|caja)\b/.test(text)
  const wantsSales =
    /\b(venta|ventas|ticket|tickets|ingreso|ingresos|cu[aá]nto|total|hoy|semana|mes)\b/.test(text) ||
    wantsProfit
  const wantsTop = /\b(top|ranking|m[aá]s vendido)\b/.test(text)
  const wantsRecent = /\b(reciente|últim|ultim|ticket|tickets|qu[eé] se vendi[oó])\b/.test(text)

  if (wantsSales) {
    allow('sales_total_today')
    allow('sales_total_period', { period: 'week' })
  }
  if (wantsProfit) {
    allow('cash_flow_period', { period: 'week' })
  }
  if (wantsExpenses) {
    allow('expenses_total_period', { period: 'week' })
  }
  if (wantsTop) {
    allow('top_product_period', { period: 'week', limit: 5 })
  }
  if (wantsRecent) {
    allow('recent_pos_sales', { period: 'week', limit: 8 })
  }
  if (wantsInventory) {
    allow('inventory_snapshot')
    allow('low_stock_count')
  }

  if (picks.length === 0 && allowedTools.length > 0) {
    // Conservative default for ambiguous ERP questions: live sales + inventory.
    if (allowedTools.includes('sales_total_today')) {
      allow('sales_total_today')
    }
    if (allowedTools.includes('sales_total_period')) {
      allow('sales_total_period', { period: 'week' })
    }
    if (allowedTools.includes('inventory_snapshot')) {
      allow('inventory_snapshot')
    }
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
          `Última venta completed fuera de hoy: ${last.saleNumber} $${money(last.total) ?? '?'} (${last.createdAt || 'N/A'})`
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
        `P&L ${String(facts.period)}: ingresos $${money(facts.ingresos) ?? '0.00'} − egresos $${money(facts.egresos) ?? '0.00'} = ganancia $${money(facts.ganancia) ?? '0.00'}`
      )
      continue
    }
    if (result.toolId === 'expenses_total_period') {
      lines.push(
        `Egresos ${String(facts.period)}: $${money(facts.totalExpenses) ?? '0.00'} (${String(facts.expenseCount ?? 0)} registros)`
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

  lines.push('Fuente: Supabase Postgres (solo Sale/Expense/InventoryItem completed según tool).')
  return lines.join('\n')
}

export const runDeterministicErpDbReply = async (
  message: string,
  allowedTools: ErpToolId[]
): Promise<{ reply: string; usedTools: string[]; results: ErpToolFactResult[] }> => {
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

  const salesTool = await executeErpTool('sales_total_today', {}, [
    'sales_total_today',
    'sales_total_period',
    'inventory_snapshot'
  ])
  const weekTool = await executeErpTool('sales_total_period', { period: 'week' }, [
    'sales_total_today',
    'sales_total_period',
    'inventory_snapshot'
  ])
  const inventoryTool = await executeErpTool('inventory_snapshot', {}, [
    'sales_total_today',
    'sales_total_period',
    'inventory_snapshot'
  ])

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
      data: {
        mismatches,
        todayTotal,
        todayCount,
        inventoryCount,
        salesToolOk: salesTool.ok,
        weekToolOk: weekTool.ok
      }
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
