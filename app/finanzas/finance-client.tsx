'use client'

import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import {
  EXPENSE_CATEGORIES,
  EXPENSE_TEMPLATES,
  expenseCategoryLabels,
  type ExpenseCategory
} from '@/src/lib/finance/expense-schema'
import type { FinancePeriod } from '@/src/lib/finance/period'
import { formatMxnCurrency } from '@/src/lib/mxn-currency'

type SalesBucket = { label: string; sales: number }
type CashFlowBucket = { label: string; ingresos: number; egresos: number }
type ComparisonPoint = { name: string; value: number }
type TopProduct = {
  rank: number
  sku: string
  productName: string
  quantityDisplay: string
  revenue: number
  peakHourLabel?: string
  peakDayLabel?: string
  insight?: string
}

type SummaryResponse = {
  success: boolean
  period: FinancePeriod
  generatedAt?: string
  salesTotals: {
    day: { total: number; count: number }
    week: { total: number; count: number }
    month: { total: number; count: number }
  }
  cashFlow: {
    ingresos: number
    egresos: number
    neto: number
    salesCount: number
    expenseCount: number
    averageTicket?: number
  }
  salesSeries: SalesBucket[]
  cashFlowSeries: CashFlowBucket[]
  comparison: ComparisonPoint[]
  topProducts: TopProduct[]
}

type ExpenseRow = {
  id: string
  category: string
  description: string
  amount: number
  kind?: string
  spentAt: string
  createdByUsername: string
}

type ExpensesResponse = {
  success: boolean
  expenses: ExpenseRow[]
}

const periodOptions: Array<{ value: FinancePeriod; label: string }> = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' }
]

const chartColors = {
  sales: '#0f766e',
  income: '#047857',
  expense: '#b45309',
  grid: '#e2e8f0',
  axis: '#64748b'
}

const emptyTotals = { total: 0, count: 0 }

const formatAxisMoney = (value: number) => {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${Math.round(value)}`
}

const formatTooltipMoney = (value: unknown) => formatMxnCurrency(Number(value ?? 0))

const categoryLabel = (category: string) =>
  expenseCategoryLabels[category as ExpenseCategory] || category

export const FinanceClient = () => {
  const [period, setPeriod] = useState<FinancePeriod>('day')
  const [refreshKey, setRefreshKey] = useState(0)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<ExpenseCategory>('proveedores')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseKind, setExpenseKind] = useState<'fixed' | 'operating'>('operating')

  useEffect(() => {
    let cancelled = false

    const load = async (soft = false) => {
      if (!soft) setLoading(true)
      try {
        const [summaryResponse, expensesResponse] = await Promise.all([
          fetch(`/api/finanzas/summary?period=${period}`),
          fetch(`/api/finanzas/expenses?period=${period}`)
        ])
        if (cancelled) return

        const summaryPayload = (await summaryResponse.json()) as SummaryResponse & { message?: string }
        const expensesPayload = (await expensesResponse.json()) as ExpensesResponse & { message?: string }
        if (cancelled) return

        if (!summaryResponse.ok || !summaryPayload.success) {
          throw new Error(summaryPayload.message || 'No fue posible cargar el resumen financiero')
        }
        if (!expensesResponse.ok || !expensesPayload.success) {
          throw new Error(expensesPayload.message || 'No fue posible cargar gastos')
        }

        setSummary(summaryPayload)
        setExpenses(expensesPayload.expenses)
        setError(null)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Error de carga')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load(false)
    const intervalId = window.setInterval(() => {
      void load(true)
    }, 15000)

    const handleFocus = () => {
      void load(true)
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
    }
  }, [period, refreshKey])

  const handlePeriodChange = (nextPeriod: FinancePeriod) => {
    if (nextPeriod === period) return
    setLoading(true)
    setMessage(null)
    setPeriod(nextPeriod)
  }

  const handlePeriodKeyDown = (event: KeyboardEvent<HTMLButtonElement>, nextPeriod: FinancePeriod) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handlePeriodChange(nextPeriod)
  }

  const handleCreateExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    const parsedAmount = Number(amount.replace(',', '.'))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto válido mayor a cero')
      setSaving(false)
      return
    }

    try {
      const response = await fetch('/api/finanzas/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim(),
          amount: parsedAmount,
          kind: expenseKind
        })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible registrar el gasto')
      }

      setDescription('')
      setAmount('')
      setMessage('Gasto registrado correctamente')
      setLoading(true)
      setRefreshKey(current => current + 1)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const salesTotals = summary?.salesTotals || {
    day: emptyTotals,
    week: emptyTotals,
    month: emptyTotals
  }
  const cashFlow = summary?.cashFlow || {
    ingresos: 0,
    egresos: 0,
    neto: 0,
    salesCount: 0,
    expenseCount: 0,
    averageTicket: 0
  }
  const topProducts = summary?.topProducts || []
  const salesSeries = summary?.salesSeries || []
  const cashFlowSeries = summary?.cashFlowSeries || []
  const comparison = summary?.comparison || []

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold text-slate-950'>Finanzas</h1>
          <p className='mt-1 text-sm text-slate-600'>
            Ventas, flujo de caja, gastos y leaderboard de productos para dirección.
          </p>
          <p className='mt-1 text-xs text-emerald-700'>
            En vivo · actualiza cada 15s
            {summary?.generatedAt
              ? ` · ${new Date(summary.generatedAt).toLocaleTimeString('es-MX')}`
              : ''}
          </p>
        </div>
        <div
          className='inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1'
          role='group'
          aria-label='Periodo financiero'
        >
          {periodOptions.map(option => {
            const isActive = period === option.value
            return (
              <button
                key={option.value}
                type='button'
                aria-pressed={isActive}
                tabIndex={0}
                aria-label={`Ver periodo ${option.label}`}
                onClick={() => handlePeriodChange(option.value)}
                onKeyDown={event => handlePeriodKeyDown(event, option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className='mt-6 grid gap-3 sm:grid-cols-3' aria-label='Ventas por periodo'>
        {(
          [
            { key: 'day', label: 'Ventas del día', data: salesTotals.day },
            { key: 'week', label: 'Ventas de la semana', data: salesTotals.week },
            { key: 'month', label: 'Ventas del mes', data: salesTotals.month }
          ] as const
        ).map(card => (
          <article key={card.key} className='border border-slate-200 bg-white px-4 py-3'>
            <p className='text-xs font-medium uppercase tracking-wide text-slate-500'>{card.label}</p>
            <p className='mt-2 text-2xl font-semibold tabular-nums text-slate-950'>
              {formatMxnCurrency(card.data.total)}
            </p>
            <p className='mt-1 text-xs text-slate-500'>{card.data.count} ventas</p>
          </article>
        ))}
      </section>

      <section className='mt-4 grid gap-3 sm:grid-cols-4' aria-label='Flujo de caja'>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-xs font-medium uppercase tracking-wide text-slate-500'>Ingresos (periodo)</p>
          <p className='mt-2 text-xl font-semibold tabular-nums text-emerald-800'>
            {formatMxnCurrency(cashFlow.ingresos)}
          </p>
          <p className='mt-1 text-xs text-slate-500'>{cashFlow.salesCount} ventas completadas</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-xs font-medium uppercase tracking-wide text-slate-500'>Egresos (periodo)</p>
          <p className='mt-2 text-xl font-semibold tabular-nums text-amber-800'>
            {formatMxnCurrency(cashFlow.egresos)}
          </p>
          <p className='mt-1 text-xs text-slate-500'>{cashFlow.expenseCount} gastos</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-xs font-medium uppercase tracking-wide text-slate-500'>Flujo neto</p>
          <p
            className={`mt-2 text-xl font-semibold tabular-nums ${
              cashFlow.neto >= 0 ? 'text-slate-950' : 'text-rose-700'
            }`}
          >
            {formatMxnCurrency(cashFlow.neto)}
          </p>
          <p className='mt-1 text-xs text-slate-500'>Ingresos menos egresos</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-xs font-medium uppercase tracking-wide text-slate-500'>Ticket promedio</p>
          <p className='mt-2 text-xl font-semibold tabular-nums text-slate-950'>
            {formatMxnCurrency(cashFlow.averageTicket || 0)}
          </p>
          <p className='mt-1 text-xs text-slate-500'>Ingreso ÷ ventas del periodo</p>
        </article>
      </section>

      <section className='mt-6 grid gap-6 xl:grid-cols-2'>
        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Ventas en el periodo</h2>
          <p className='mt-0.5 text-xs text-slate-500'>Tendencia de recaudación</p>
          <div className='mt-3 h-64'>
            {salesSeries.length ? (
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={salesSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id='salesFill' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='0%' stopColor={chartColors.sales} stopOpacity={0.28} />
                      <stop offset='100%' stopColor={chartColors.sales} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray='3 3' vertical={false} />
                  <XAxis dataKey='label' tick={{ fill: chartColors.axis, fontSize: 11 }} tickLine={false} />
                  <YAxis
                    tickFormatter={formatAxisMoney}
                    tick={{ fill: chartColors.axis, fontSize: 11 }}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip formatter={formatTooltipMoney} labelFormatter={label => `Periodo: ${label}`} />
                  <Area
                    type='monotone'
                    dataKey='sales'
                    name='Ventas'
                    stroke={chartColors.sales}
                    fill='url(#salesFill)'
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className='flex h-full items-center justify-center text-sm text-slate-500'>
                {loading ? 'Cargando ventas…' : 'Sin ventas en este periodo.'}
              </p>
            )}
          </div>
        </article>

        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Ingresos vs. egresos</h2>
          <p className='mt-0.5 text-xs text-slate-500'>Comparación por intervalo</p>
          <div className='mt-3 h-64'>
            {cashFlowSeries.length ? (
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={cashFlowSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray='3 3' vertical={false} />
                  <XAxis dataKey='label' tick={{ fill: chartColors.axis, fontSize: 11 }} tickLine={false} />
                  <YAxis
                    tickFormatter={formatAxisMoney}
                    tick={{ fill: chartColors.axis, fontSize: 11 }}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip formatter={formatTooltipMoney} labelFormatter={label => `Periodo: ${label}`} />
                  <Legend />
                  <Bar dataKey='ingresos' name='Ingresos' fill={chartColors.income} radius={[3, 3, 0, 0]} />
                  <Bar dataKey='egresos' name='Egresos' fill={chartColors.expense} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className='flex h-full items-center justify-center text-sm text-slate-500'>
                {loading ? 'Cargando flujo…' : 'Sin movimientos en este periodo.'}
              </p>
            )}
          </div>
        </article>
      </section>

      <section className='mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]'>
        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Leaderboard por cantidad</h2>
          <p className='mt-0.5 text-xs text-slate-500'>Top productos + hora pico y día más fuerte</p>
          <div className='mt-3 h-72'>
            {topProducts.length ? (
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart
                  data={topProducts}
                  layout='vertical'
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray='3 3' horizontal={false} />
                  <XAxis
                    type='number'
                    tickFormatter={formatAxisMoney}
                    tick={{ fill: chartColors.axis, fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    type='category'
                    dataKey='productName'
                    width={120}
                    tick={{ fill: chartColors.axis, fontSize: 11 }}
                    tickLine={false}
                  />
                  <Tooltip formatter={formatTooltipMoney} labelFormatter={label => String(label)} />
                  <Bar dataKey='revenue' name='Ingreso' radius={[0, 3, 3, 0]}>
                    {topProducts.map(product => (
                      <Cell key={product.sku} fill={chartColors.sales} fillOpacity={1 - (product.rank - 1) * 0.08} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className='flex h-full items-center justify-center text-sm text-slate-500'>
                {loading ? 'Cargando productos…' : 'Sin productos vendidos en este periodo.'}
              </p>
            )}
          </div>
          {topProducts.length ? (
            <div className='mt-3 overflow-x-auto'>
              <table className='min-w-full divide-y divide-slate-200'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      #
                    </th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      Producto
                    </th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      Cantidad
                    </th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      Pico
                    </th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      Ingreso
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {topProducts.map(product => (
                    <tr key={product.sku}>
                      <td className='px-3 py-2 text-sm text-slate-600'>{product.rank}</td>
                      <td className='px-3 py-2 text-sm text-slate-800'>
                        <span className='font-medium'>{product.productName}</span>
                        <span className='ml-2 text-xs text-slate-500'>{product.sku}</span>
                      </td>
                      <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>{product.quantityDisplay}</td>
                      <td className='px-3 py-2 text-xs text-slate-600'>
                        {product.insight || `${product.peakHourLabel || '—'} · ${product.peakDayLabel || '—'}`}
                      </td>
                      <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                        {formatMxnCurrency(product.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>

        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Resumen del periodo</h2>
          <p className='mt-0.5 text-xs text-slate-500'>Ingresos frente a egresos totales</p>
          <div className='mt-3 h-56'>
            {comparison.some(point => point.value > 0) ? (
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={comparison} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray='3 3' vertical={false} />
                  <XAxis dataKey='name' tick={{ fill: chartColors.axis, fontSize: 12 }} tickLine={false} />
                  <YAxis
                    tickFormatter={formatAxisMoney}
                    tick={{ fill: chartColors.axis, fontSize: 11 }}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip formatter={formatTooltipMoney} />
                  <Bar dataKey='value' name='Monto' radius={[3, 3, 0, 0]}>
                    {comparison.map(point => (
                      <Cell
                        key={point.name}
                        fill={point.name === 'Ingresos' ? chartColors.income : chartColors.expense}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className='flex h-full items-center justify-center text-sm text-slate-500'>
                {loading ? 'Cargando…' : 'Sin datos para comparar.'}
              </p>
            )}
          </div>
        </article>
      </section>

      <section className='mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]'>
        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Registrar gasto</h2>
          <p className='mt-0.5 text-xs text-slate-500'>Plantillas rápidas para fijos y corrientes</p>
          <div className='mt-3 flex flex-wrap gap-2'>
            {EXPENSE_TEMPLATES.map(template => (
              <button
                key={`${template.category}-${template.description}`}
                type='button'
                onClick={() => {
                  setCategory(template.category)
                  setDescription(template.description)
                  setExpenseKind(template.kind)
                }}
                aria-label={`Usar plantilla ${template.description}`}
                className='rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50'
              >
                {template.description}
              </button>
            ))}
          </div>
          <form className='mt-4 space-y-3' onSubmit={handleCreateExpense}>
            <div>
              <label htmlFor='expense-kind' className='text-xs font-medium text-slate-600'>
                Tipo
              </label>
              <select
                id='expense-kind'
                value={expenseKind}
                onChange={event => setExpenseKind(event.target.value as 'fixed' | 'operating')}
                className='mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm'
              >
                <option value='fixed'>Fijo / producción</option>
                <option value='operating'>Corriente</option>
              </select>
            </div>
            <div>
              <label htmlFor='expense-category' className='text-xs font-medium text-slate-600'>
                Categoría
              </label>
              <select
                id='expense-category'
                value={category}
                onChange={event => setCategory(event.target.value as ExpenseCategory)}
                className='mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
                aria-label='Categoría del gasto'
              >
                {EXPENSE_CATEGORIES.map(item => (
                  <option key={item} value={item}>
                    {expenseCategoryLabels[item]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor='expense-description' className='text-xs font-medium text-slate-600'>
                Descripción
              </label>
              <input
                id='expense-description'
                type='text'
                required
                minLength={2}
                maxLength={240}
                value={description}
                onChange={event => setDescription(event.target.value)}
                className='mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900'
                aria-label='Descripción del gasto'
                placeholder='Ej. Pago de renta mensual'
              />
            </div>
            <div>
              <label htmlFor='expense-amount' className='text-xs font-medium text-slate-600'>
                Monto (MXN)
              </label>
              <input
                id='expense-amount'
                type='text'
                inputMode='decimal'
                required
                value={amount}
                onChange={event => setAmount(event.target.value)}
                className='mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums text-slate-900'
                aria-label='Monto del gasto en pesos'
                placeholder='0.00'
              />
            </div>
            <button
              type='submit'
              disabled={saving}
              className='w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
              aria-label='Guardar gasto'
            >
              {saving ? 'Guardando…' : 'Registrar gasto'}
            </button>
          </form>
        </article>

        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Gastos del periodo</h2>
          <div className='mt-3 overflow-x-auto'>
            <table className='min-w-full divide-y divide-slate-200'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    Categoría
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    Descripción
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    Monto
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {expenses.map(expense => (
                  <tr key={expense.id}>
                    <td className='px-3 py-2 text-sm text-slate-700'>{categoryLabel(expense.category)}</td>
                    <td className='px-3 py-2 text-sm text-slate-700'>{expense.description}</td>
                    <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                      {formatMxnCurrency(expense.amount)}
                    </td>
                    <td className='px-3 py-2 text-sm text-slate-700'>
                      {new Date(expense.spentAt).toLocaleString('es-MX')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!expenses.length ? (
              <p className='px-3 py-4 text-sm text-slate-500'>
                {loading ? 'Cargando gastos…' : 'Sin gastos registrados en este periodo.'}
              </p>
            ) : null}
          </div>
        </article>
      </section>

      {message ? (
        <p aria-live='polite' className='mt-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'>
          {message}
        </p>
      ) : null}
      {error ? (
        <p aria-live='assertive' className='mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
