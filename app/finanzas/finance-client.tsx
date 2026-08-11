'use client'

import Link from 'next/link'
import { useEffect, useState, type KeyboardEvent } from 'react'

import type { FinancePeriod } from '@/src/lib/finance/period'
import { formatMxnCurrency } from '@/src/lib/mxn-currency'

type TopProduct = {
  rank: number
  sku: string
  productName: string
  quantityDisplay: string
  revenue: number
  insight?: string
}

type SummaryResponse = {
  success: boolean
  generatedAt?: string
  salesTotals: {
    day: { total: number; count: number; discountTotal?: number }
    week: { total: number; count: number; discountTotal?: number }
    month: { total: number; count: number; discountTotal?: number }
  }
  cashFlow: {
    ingresos: number
    egresos: number
    neto: number
    salesCount: number
    expenseCount: number
    averageTicket?: number
  }
  topProducts: TopProduct[]
}

const periodOptions: Array<{ value: FinancePeriod; label: string }> = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' }
]

const emptyTotals = { total: 0, count: 0, discountTotal: 0 }

const financeLinks = [
  { href: '/finanzas/periodos', label: 'Periodos', description: 'Gráficas y rango personalizado' },
  { href: '/finanzas/fondos', label: 'Fondos activo', description: 'Caja y liquidez operativa' },
  { href: '/finanzas/pasivo', label: 'Pasivo corriente', description: 'Gastos y compromisos' },
  { href: '/finanzas/compras', label: 'Compras y Proveedores', description: 'Restock y proveedores' },
  { href: '/finanzas/promociones', label: 'Descuentos y promociones', description: 'Ofertas activas' }
]

export const FinanceClient = () => {
  const [period, setPeriod] = useState<FinancePeriod>('day')
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async (soft = false) => {
      if (!soft) setLoading(true)
      try {
        const response = await fetch(`/api/finanzas/summary?period=${period}`)
        const payload = (await response.json()) as SummaryResponse & { message?: string }
        if (cancelled) return
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'No fue posible cargar finanzas')
        }
        setSummary(payload)
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

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [period])

  const handlePeriodChange = (nextPeriod: FinancePeriod) => {
    if (nextPeriod === period) return
    setLoading(true)
    setPeriod(nextPeriod)
  }

  const handlePeriodKeyDown = (event: KeyboardEvent<HTMLButtonElement>, nextPeriod: FinancePeriod) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handlePeriodChange(nextPeriod)
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

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold text-slate-950'>Finanzas</h1>
          <p className='mt-1 text-sm text-slate-600'>
            Resumen compacto de ventas, leaderboard y accesos a periodos, fondos y proveedores.
          </p>
          <p className='mt-1 text-xs text-emerald-700'>
            En vivo · cada 15s
            {summary?.generatedAt ? ` · ${new Date(summary.generatedAt).toLocaleTimeString('es-MX')}` : ''}
          </p>
        </div>
        <div className='inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1' role='group' aria-label='Periodo'>
          {periodOptions.map(option => {
            const isActive = period === option.value
            return (
              <button
                key={option.value}
                type='button'
                aria-pressed={isActive}
                tabIndex={0}
                aria-label={`Ver ${option.label}`}
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

      <section className='mt-5 grid gap-3 sm:grid-cols-3' aria-label='Ventas por periodo'>
        {(
          [
            { key: 'day', label: 'Hoy', data: salesTotals.day },
            { key: 'week', label: 'Semana', data: salesTotals.week },
            { key: 'month', label: 'Mes', data: salesTotals.month }
          ] as Array<{
            key: string
            label: string
            data: { total: number; count: number; discountTotal?: number }
          }>
        ).map(card => (
          <article key={card.key} className='border border-slate-200 bg-white px-4 py-3'>
            <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>{card.label}</p>
            <p className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>
              {formatMxnCurrency(card.data.total)}
            </p>
            <p className='text-xs text-slate-500'>{card.data.count} ventas</p>
            {(card.data.discountTotal || 0) > 0 ? (
              <p className='text-xs text-emerald-700'>
                Descuentos {formatMxnCurrency(card.data.discountTotal || 0)}
              </p>
            ) : null}
          </article>
        ))}
      </section>

      <section className='mt-3 grid gap-3 sm:grid-cols-4' aria-label='Flujo resumido'>
        <article className='border border-slate-200 bg-white px-3 py-2.5'>
          <p className='text-[11px] uppercase tracking-wide text-slate-500'>Ingresos</p>
          <p className='mt-1 text-lg font-semibold tabular-nums text-emerald-800'>
            {formatMxnCurrency(cashFlow.ingresos)}
          </p>
        </article>
        <article className='border border-slate-200 bg-white px-3 py-2.5'>
          <p className='text-[11px] uppercase tracking-wide text-slate-500'>Egresos</p>
          <p className='mt-1 text-lg font-semibold tabular-nums text-slate-600'>
            {formatMxnCurrency(cashFlow.egresos)}
          </p>
        </article>
        <article className='border border-slate-200 bg-white px-3 py-2.5'>
          <p className='text-[11px] uppercase tracking-wide text-slate-500'>Ganancia</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              cashFlow.neto >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatMxnCurrency(cashFlow.neto)}
          </p>
        </article>
        <article className='border border-slate-200 bg-white px-3 py-2.5'>
          <p className='text-[11px] uppercase tracking-wide text-slate-500'>Ticket prom.</p>
          <p className='mt-1 text-lg font-semibold tabular-nums text-slate-950'>
            {formatMxnCurrency(cashFlow.averageTicket || 0)}
          </p>
        </article>
      </section>

      <section className='mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]'>
        <article className='border border-slate-200 bg-white p-4'>
          <div className='flex items-center justify-between gap-2'>
            <h2 className='text-sm font-semibold text-slate-900'>Leaderboard</h2>
            <Link href='/finanzas/periodos' className='text-xs font-medium text-emerald-700 underline'>
              Ver gráficas
            </Link>
          </div>
          <div className='mt-3 overflow-x-auto'>
            <table className='min-w-full divide-y divide-slate-200'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-slate-500'>#</th>
                  <th className='px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-slate-500'>Producto</th>
                  <th className='px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-slate-500'>Cant.</th>
                  <th className='px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-slate-500'>Ingreso</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {topProducts.slice(0, 8).map(product => (
                  <tr key={product.sku}>
                    <td className='px-2 py-1.5 text-sm text-slate-600'>{product.rank}</td>
                    <td className='px-2 py-1.5 text-sm text-slate-800'>{product.productName}</td>
                    <td className='px-2 py-1.5 text-sm tabular-nums text-slate-700'>{product.quantityDisplay}</td>
                    <td className='px-2 py-1.5 text-sm tabular-nums text-slate-700'>
                      {formatMxnCurrency(product.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && !topProducts.length ? (
              <p className='px-2 py-3 text-sm text-slate-500'>Cargando…</p>
            ) : null}
            {!loading && !topProducts.length ? (
              <p className='px-2 py-3 text-sm text-slate-500'>Sin ventas en el periodo.</p>
            ) : null}
          </div>
        </article>

        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Módulos</h2>
          <ul className='mt-3 space-y-2'>
            {financeLinks.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-label={link.label}
                  className='block rounded-lg border border-slate-200 px-3 py-2 transition hover:border-emerald-300 hover:bg-emerald-50/40'
                >
                  <p className='text-sm font-medium text-slate-900'>{link.label}</p>
                  <p className='text-xs text-slate-500'>{link.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </article>
      </section>

      {error ? (
        <p role='alert' className='mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
