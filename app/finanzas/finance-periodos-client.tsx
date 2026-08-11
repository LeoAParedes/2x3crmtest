'use client'

import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
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
import {
  CASH_FLOW_WINDOW_OPTIONS,
  type CashFlowWindowDays
} from '@/src/lib/finance/period'
import { formatMxnCurrency } from '@/src/lib/mxn-currency'

type SalesBucket = { label: string; sales: number }
type CashFlowBucket = {
  label: string
  ingresos: number
  egresos: number
  ganancia?: number
  gananciaPlot?: number
  gananciaNegative?: boolean
}
type ComparisonPoint = { name: string; value: number; signedValue?: number; negative?: boolean }
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

type ExpenseRow = {
  id: string
  category: string
  description: string
  amount: number
  kind?: string
  spentAt: string
  createdByUsername: string
}

type PeriodosResponse = {
  success: boolean
  generatedAt?: string
  timeZone?: string
  panels: {
    sales: {
      label: string
      range: { start: string; end: string }
      totals: { total: number; count: number }
      series: SalesBucket[]
    }
    cashFlow: {
      label: string
      days: number
      range: { start: string; end: string }
      ingresos: number
      egresos: number
      neto: number
      ganancia: number
      gananciaNegative: boolean
      salesCount: number
      expenseCount: number
      averageTicket: number
      series: CashFlowBucket[]
      comparison: ComparisonPoint[]
    }
    leaderboard: {
      label: string
      range: { start: string; end: string }
      topProducts: TopProduct[]
    }
  }
  expenses: ExpenseRow[]
}

type PanelId = 'sales' | 'cashFlow' | 'leaderboard' | 'comparison' | 'expensesList' | 'kpi'

type PeriodosPrefs = {
  cashFlowDays: CashFlowWindowDays
  visible: Record<PanelId, boolean>
  collapsed: Record<PanelId, boolean>
}

const PREFS_KEY = 'finanzas-periodos-prefs-v1'

const defaultPrefs = (): PeriodosPrefs => ({
  cashFlowDays: 15,
  visible: {
    sales: true,
    cashFlow: true,
    leaderboard: true,
    comparison: true,
    expensesList: true,
    kpi: true
  },
  collapsed: {
    sales: false,
    cashFlow: false,
    leaderboard: false,
    comparison: false,
    expensesList: false,
    kpi: false
  }
})

const readPrefs = (): PeriodosPrefs => {
  if (typeof window === 'undefined') return defaultPrefs()
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return defaultPrefs()
    const parsed = JSON.parse(raw) as Partial<PeriodosPrefs>
    const base = defaultPrefs()
    const days = parsed.cashFlowDays
    return {
      cashFlowDays: CASH_FLOW_WINDOW_OPTIONS.includes(days as CashFlowWindowDays)
        ? (days as CashFlowWindowDays)
        : 15,
      visible: { ...base.visible, ...(parsed.visible || {}) },
      collapsed: { ...base.collapsed, ...(parsed.collapsed || {}) }
    }
  } catch {
    return defaultPrefs()
  }
}

const chartColors = {
  sales: '#0f766e',
  income: '#047857',
  expense: '#6b7280',
  profit: '#16a34a',
  loss: '#dc2626',
  grid: '#e2e8f0',
  axis: '#64748b'
}

const formatAxisMoney = (value: number) => {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${Math.round(value)}`
}

const formatTooltipMoney = (value: unknown) => formatMxnCurrency(Number(value ?? 0))

const categoryLabel = (category: string) =>
  expenseCategoryLabels[category as ExpenseCategory] || category

const panelLabels: Record<PanelId, string> = {
  kpi: 'Tarjetas de resumen',
  sales: 'Ventas del periodo',
  cashFlow: 'Ingresos, egresos y ganancia',
  leaderboard: 'Leaderboard por cantidad',
  comparison: 'Resumen comparación',
  expensesList: 'Gastos del periodo'
}

type CollapsibleCardProps = {
  id: PanelId
  title: string
  subtitle?: string
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}

const CollapsibleCard = ({ id, title, subtitle, collapsed, onToggle, children }: CollapsibleCardProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onToggle()
  }

  return (
    <article className='border border-slate-200 bg-white'>
      <button
        type='button'
        aria-expanded={!collapsed}
        aria-controls={`panel-${id}`}
        aria-label={`${collapsed ? 'Expandir' : 'Colapsar'} ${title}`}
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className='flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50'
      >
        <div>
          <h2 className='text-sm font-semibold text-slate-900'>{title}</h2>
          {subtitle ? <p className='mt-0.5 text-xs text-slate-500'>{subtitle}</p> : null}
        </div>
        <span className='mt-0.5 text-slate-500' aria-hidden='true'>
          {collapsed ? '▸' : '▾'}
        </span>
      </button>
      {!collapsed ? (
        <div id={`panel-${id}`} className='border-t border-slate-100 px-4 pb-4 pt-3'>
          {children}
        </div>
      ) : null}
    </article>
  )
}

export const FinancePeriodosClient = () => {
  const [prefs, setPrefs] = useState<PeriodosPrefs>(defaultPrefs)
  const [prefsReady, setPrefsReady] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [useCustomRange, setUseCustomRange] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [data, setData] = useState<PeriodosResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [category, setCategory] = useState<ExpenseCategory>('proveedores')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseKind, setExpenseKind] = useState<'fixed' | 'operating'>('operating')

  useEffect(() => {
    const loaded = readPrefs()
    queueMicrotask(() => {
      setPrefs(loaded)
      setPrefsReady(true)
    })
  }, [])

  useEffect(() => {
    if (!prefsReady) return
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }, [prefs, prefsReady])

  useEffect(() => {
    if (!prefsReady) return
    let cancelled = false

    const load = async (soft = false) => {
      if (!soft) setLoading(true)
      try {
        const params = new URLSearchParams({
          mode: 'periodos',
          cashFlowDays: String(prefs.cashFlowDays)
        })
        if (useCustomRange && customFrom && customTo) {
          params.set('from', customFrom)
          params.set('to', customTo)
        }
        const response = await fetch(`/api/finanzas/summary?${params.toString()}`)
        if (cancelled) return
        const payload = (await response.json()) as PeriodosResponse & { message?: string }
        if (!response.ok || !payload.success || !payload.panels) {
          throw new Error(payload.message || 'No fue posible cargar el resumen financiero')
        }
        setData(payload)
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
  }, [prefsReady, prefs.cashFlowDays, refreshKey, useCustomRange, customFrom, customTo])

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
      setShowExpenseForm(false)
      setRefreshKey(current => current + 1)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleCollapsed = (id: PanelId) => {
    setPrefs(current => ({
      ...current,
      collapsed: { ...current.collapsed, [id]: !current.collapsed[id] }
    }))
  }

  const handleToggleVisible = (id: PanelId) => {
    setPrefs(current => ({
      ...current,
      visible: { ...current.visible, [id]: !current.visible[id] }
    }))
  }

  const handleCashFlowDaysChange = (days: CashFlowWindowDays) => {
    setPrefs(current => ({ ...current, cashFlowDays: days }))
  }

  const panels = data?.panels
  const salesSeries = panels?.sales.series || []
  const cashFlowSeries = (panels?.cashFlow.series || []).map(bucket => {
    const computedGanancia =
      typeof bucket.ganancia === 'number'
        ? bucket.ganancia
        : Number((bucket.ingresos - bucket.egresos).toFixed(2))
    return {
      ...bucket,
      ganancia: computedGanancia,
      gananciaPlot: Math.abs(computedGanancia),
      gananciaNegative: computedGanancia < 0
    }
  })
  const comparison = panels?.cashFlow.comparison || []
  const topProducts = panels?.leaderboard.topProducts || []
  const expenses = data?.expenses || []
  const ganancia = panels?.cashFlow.ganancia ?? 0

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='border-b border-slate-200 pb-5'>
        <h1 className='text-2xl font-semibold text-slate-950'>Periodos</h1>
        <p className='mt-1 text-sm text-slate-600'>
          Ventas por rango · P&L a quincena · leaderboard del mes (Pacífico).
        </p>
        <p className='mt-1 text-xs text-emerald-700'>
          En vivo · {data?.timeZone || 'America/Los_Angeles'} · actualiza cada 15s
          {data?.generatedAt
            ? ` · ${new Date(data.generatedAt).toLocaleTimeString('es-MX', {
                timeZone: data.timeZone || 'America/Los_Angeles'
              })}`
            : ''}
        </p>
      </section>

      <section className='mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3'>
        <div className='flex flex-wrap items-end gap-3'>
          <label className='grid gap-1 text-xs font-medium text-slate-600'>
            Desde
            <input
              type='date'
              value={customFrom}
              onChange={event => setCustomFrom(event.target.value)}
              aria-label='Fecha desde'
              className='h-9 rounded-lg border border-slate-300 px-2 text-sm'
            />
          </label>
          <label className='grid gap-1 text-xs font-medium text-slate-600'>
            Hasta
            <input
              type='date'
              value={customTo}
              onChange={event => setCustomTo(event.target.value)}
              aria-label='Fecha hasta'
              className='h-9 rounded-lg border border-slate-300 px-2 text-sm'
            />
          </label>
          <button
            type='button'
            aria-label='Aplicar rango a ventas'
            disabled={!customFrom || !customTo}
            onClick={() => {
              setUseCustomRange(true)
              setRefreshKey(current => current + 1)
            }}
            className='h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50'
          >
            Aplicar a ventas
          </button>
          {useCustomRange ? (
            <button
              type='button'
              aria-label='Usar últimos 7 días en ventas'
              onClick={() => {
                setUseCustomRange(false)
                setRefreshKey(current => current + 1)
              }}
              className='h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700'
            >
              Últimos 7 días
            </button>
          ) : (
            <p className='pb-2 text-xs text-slate-500'>Ventas: últimos 7 días</p>
          )}
        </div>

        <div className='relative flex items-center gap-2'>
          <button
            type='button'
            aria-label='Registrar gasto'
            aria-expanded={showExpenseForm}
            onClick={() => {
              setShowExpenseForm(current => !current)
              setShowSettings(false)
            }}
            className='h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800'
          >
            Registrar gasto
          </button>
          <button
            type='button'
            aria-label='Preferencias de gráficas'
            aria-expanded={showSettings}
            onClick={() => {
              setShowSettings(current => !current)
              setShowExpenseForm(false)
            }}
            className='flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50'
          >
            <span aria-hidden='true' className='text-lg leading-none'>
              ⚙
            </span>
          </button>

          {showSettings ? (
            <div
              className='absolute right-0 top-11 z-20 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg'
              role='dialog'
              aria-label='Preferencias de gráficas'
            >
              <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Comparación de gastos
              </p>
              <div className='mt-2 flex gap-1'>
                {CASH_FLOW_WINDOW_OPTIONS.map(days => (
                  <button
                    key={days}
                    type='button'
                    aria-pressed={prefs.cashFlowDays === days}
                    aria-label={`Usar ${days} días`}
                    onClick={() => handleCashFlowDaysChange(days)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                      prefs.cashFlowDays === days
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 text-slate-700'
                    }`}
                  >
                    {days === 15 ? 'Quincena' : `${days}d`}
                  </button>
                ))}
              </div>
              <p className='mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Mostrar / ocultar
              </p>
              <ul className='mt-2 space-y-1'>
                {(Object.keys(panelLabels) as PanelId[]).map(id => (
                  <li key={id}>
                    <label className='flex cursor-pointer items-center gap-2 text-sm text-slate-700'>
                      <input
                        type='checkbox'
                        checked={prefs.visible[id]}
                        onChange={() => handleToggleVisible(id)}
                        aria-label={`Mostrar ${panelLabels[id]}`}
                      />
                      {panelLabels[id]}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {showExpenseForm ? (
        <section className='mt-3 rounded-xl border border-slate-900/10 bg-slate-50 p-4' aria-label='Formulario de gasto'>
          <div className='flex flex-wrap gap-2'>
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
                className='rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50'
              >
                {template.description}
              </button>
            ))}
          </div>
          <form className='mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4' onSubmit={handleCreateExpense}>
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
                className='mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'
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
                className='mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm'
                aria-label='Descripción del gasto'
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
                className='mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums'
                aria-label='Monto del gasto en pesos'
              />
            </div>
            <div className='sm:col-span-2 lg:col-span-4'>
              <button
                type='submit'
                disabled={saving}
                className='h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60'
                aria-label='Guardar gasto'
              >
                {saving ? 'Guardando…' : 'Guardar gasto'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {prefs.visible.kpi ? (
        <div className='mt-4'>
          <CollapsibleCard
            id='kpi'
            title='Resumen P&L'
            subtitle={panels?.cashFlow.label || 'Quincena'}
            collapsed={prefs.collapsed.kpi}
            onToggle={() => handleToggleCollapsed('kpi')}
          >
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <div className='border border-slate-200 bg-white px-3 py-2'>
                <p className='text-[11px] uppercase tracking-wide text-slate-500'>Ingresos</p>
                <p className='mt-1 text-lg font-semibold tabular-nums text-emerald-800'>
                  {formatMxnCurrency(panels?.cashFlow.ingresos || 0)}
                </p>
                <p className='text-xs text-slate-500'>{panels?.cashFlow.salesCount || 0} ventas</p>
              </div>
              <div className='border border-slate-200 bg-white px-3 py-2'>
                <p className='text-[11px] uppercase tracking-wide text-slate-500'>Egresos</p>
                <p className='mt-1 text-lg font-semibold tabular-nums text-slate-600'>
                  {formatMxnCurrency(panels?.cashFlow.egresos || 0)}
                </p>
                <p className='text-xs text-slate-500'>{panels?.cashFlow.expenseCount || 0} gastos</p>
              </div>
              <div className='border border-slate-200 bg-white px-3 py-2'>
                <p className='text-[11px] uppercase tracking-wide text-slate-500'>Ganancia</p>
                <p
                  className={`mt-1 text-lg font-semibold tabular-nums ${
                    ganancia >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {formatMxnCurrency(ganancia)}
                </p>
              </div>
              <div className='border border-slate-200 bg-white px-3 py-2'>
                <p className='text-[11px] uppercase tracking-wide text-slate-500'>Ventas (panel)</p>
                <p className='mt-1 text-lg font-semibold tabular-nums text-slate-950'>
                  {formatMxnCurrency(panels?.sales.totals.total || 0)}
                </p>
                <p className='text-xs text-slate-500'>{panels?.sales.label}</p>
              </div>
            </div>
          </CollapsibleCard>
        </div>
      ) : null}

      <section className='mt-4 grid gap-4 xl:grid-cols-2'>
        {prefs.visible.sales ? (
          <CollapsibleCard
            id='sales'
            title='Ventas del periodo'
            subtitle={panels?.sales.label || 'Últimos 7 días'}
            collapsed={prefs.collapsed.sales}
            onToggle={() => handleToggleCollapsed('sales')}
          >
            <div className='h-64'>
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
                    <Tooltip formatter={formatTooltipMoney} />
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
          </CollapsibleCard>
        ) : null}

        {prefs.visible.cashFlow ? (
          <CollapsibleCard
            id='cashFlow'
            title='Ingresos, egresos y ganancia'
            subtitle={`${panels?.cashFlow.label || 'Quincena'} · egreso gris · ganancia verde/rojo`}
            collapsed={prefs.collapsed.cashFlow}
            onToggle={() => handleToggleCollapsed('cashFlow')}
          >
            <div className='h-64'>
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
                    <Tooltip
                      formatter={(value, name, item) => {
                        const payload = item?.payload as CashFlowBucket | undefined
                        if (name === 'Ganancia' && payload) {
                          return formatMxnCurrency(payload.ganancia ?? Number(value ?? 0))
                        }
                        return formatTooltipMoney(value)
                      }}
                    />
                    <Legend />
                    <Bar dataKey='ingresos' name='Ingresos' fill={chartColors.income} radius={[3, 3, 0, 0]} />
                    <Bar dataKey='egresos' name='Egresos' fill={chartColors.expense} radius={[3, 3, 0, 0]} />
                    <Bar dataKey='gananciaPlot' name='Ganancia' radius={[3, 3, 0, 0]}>
                      {cashFlowSeries.map(bucket => (
                        <Cell
                          key={`ganancia-${bucket.label}`}
                          fill={bucket.gananciaNegative ? chartColors.loss : chartColors.profit}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className='flex h-full items-center justify-center text-sm text-slate-500'>
                  {loading ? 'Cargando flujo…' : 'Sin movimientos en este periodo.'}
                </p>
              )}
            </div>
          </CollapsibleCard>
        ) : null}
      </section>

      <section className='mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]'>
        {prefs.visible.leaderboard ? (
          <CollapsibleCard
            id='leaderboard'
            title='Leaderboard por cantidad'
            subtitle={panels?.leaderboard.label || 'Último mes'}
            collapsed={prefs.collapsed.leaderboard}
            onToggle={() => handleToggleCollapsed('leaderboard')}
          >
            <div className='h-72'>
              {topProducts.length ? (
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart data={topProducts} layout='vertical' margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
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
                    <Tooltip formatter={formatTooltipMoney} />
                    <Bar dataKey='revenue' name='Ingreso' radius={[0, 3, 3, 0]}>
                      {topProducts.map(product => (
                        <Cell
                          key={product.sku}
                          fill={chartColors.sales}
                          fillOpacity={1 - (product.rank - 1) * 0.08}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className='flex h-full items-center justify-center text-sm text-slate-500'>
                  {loading ? 'Cargando productos…' : 'Sin productos vendidos en el mes.'}
                </p>
              )}
            </div>
            {topProducts.length ? (
              <div className='mt-3 overflow-x-auto'>
                <table className='min-w-full divide-y divide-slate-200'>
                  <thead className='bg-slate-50'>
                    <tr>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>#</th>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                        Producto
                      </th>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                        Cantidad
                      </th>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                        Ingreso
                      </th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-slate-100'>
                    {topProducts.map(product => (
                      <tr key={product.sku}>
                        <td className='px-3 py-2 text-sm text-slate-600'>{product.rank}</td>
                        <td className='px-3 py-2 text-sm text-slate-800'>{product.productName}</td>
                        <td className='px-3 py-2 text-sm tabular-nums'>{product.quantityDisplay}</td>
                        <td className='px-3 py-2 text-sm tabular-nums'>
                          {formatMxnCurrency(product.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CollapsibleCard>
        ) : null}

        {prefs.visible.comparison ? (
          <CollapsibleCard
            id='comparison'
            title='Resumen comparación'
            subtitle={`Persistente: ${prefs.cashFlowDays === 15 ? 'quincena' : `${prefs.cashFlowDays} días`}`}
            collapsed={prefs.collapsed.comparison}
            onToggle={() => handleToggleCollapsed('comparison')}
          >
            <div className='h-56'>
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
                    <Tooltip
                      formatter={(value, _name, item) => {
                        const point = item?.payload as ComparisonPoint | undefined
                        if (point?.name === 'Ganancia' && typeof point.signedValue === 'number') {
                          return formatMxnCurrency(point.signedValue)
                        }
                        return formatTooltipMoney(value)
                      }}
                    />
                    <Bar dataKey='value' name='Monto' radius={[3, 3, 0, 0]}>
                      {comparison.map(point => (
                        <Cell
                          key={point.name}
                          fill={
                            point.name === 'Ingresos'
                              ? chartColors.income
                              : point.name === 'Egresos'
                                ? chartColors.expense
                                : point.negative
                                  ? chartColors.loss
                                  : chartColors.profit
                          }
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
          </CollapsibleCard>
        ) : null}
      </section>

      {prefs.visible.expensesList ? (
        <div className='mt-4'>
          <CollapsibleCard
            id='expensesList'
            title='Gastos del periodo'
            subtitle={panels?.cashFlow.label || 'Quincena'}
            collapsed={prefs.collapsed.expensesList}
            onToggle={() => handleToggleCollapsed('expensesList')}
          >
            <div className='overflow-x-auto'>
              <table className='min-w-full divide-y divide-slate-200'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                      Categoría
                    </th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                      Descripción
                    </th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                      Monto
                    </th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {expenses.map(expense => (
                    <tr key={expense.id}>
                      <td className='px-3 py-2 text-sm text-slate-700'>{categoryLabel(expense.category)}</td>
                      <td className='px-3 py-2 text-sm text-slate-700'>{expense.description}</td>
                      <td className='px-3 py-2 text-sm tabular-nums'>{formatMxnCurrency(expense.amount)}</td>
                      <td className='px-3 py-2 text-sm text-slate-700'>
                        {new Date(expense.spentAt).toLocaleString('es-MX', {
                          timeZone: data?.timeZone || 'America/Los_Angeles'
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!expenses.length ? (
                <p className='px-3 py-4 text-sm text-slate-500'>
                  {loading ? 'Cargando gastos…' : 'Sin gastos en esta ventana.'}
                </p>
              ) : null}
            </div>
          </CollapsibleCard>
        </div>
      ) : null}

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
