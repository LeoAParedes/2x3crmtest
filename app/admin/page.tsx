'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { formatMxnCurrency } from '@/src/lib/mxn-currency'
import { formatStockQuantityLabel } from '@/src/lib/inventory/logbook-quantity'

type TodayHub = {
  success: boolean
  generatedAt?: string
  salesToday: { total: number; count: number; discountTotal: number }
  paymentMethods: {
    cash: { count: number; total: number }
    card: { count: number; total: number }
    credit: { count: number; total: number }
  }
  cash: {
    currentShiftSlot: 'morning' | 'afternoon' | null
    outsideShiftHours: boolean
    openSession: { id: string; cashSalesTotal: number; cardSalesTotal: number; creditSalesTotal?: number } | null
  }
  alerts: {
    totalCount: number
    lowStock: Array<{
      id: string
      sku: string
      productName: string
      stock: number
      minStock: number
      supportsWeight?: boolean
    }>
    expiry: Array<{
      id: string
      sku: string
      productName: string
      quantityRemaining: number
      supportsWeight?: boolean
      expiresOn: string
      alertKind: string | null
    }>
  }
  shortcuts: Array<{ href: string; label: string }>
  message?: string
}

export default function AdminPage() {
  const [hub, setHub] = useState<TodayHub | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/today')
      const payload = (await response.json()) as TodayHub
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible cargar el dashboard')
      }
      setHub(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error de carga')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void handleLoad()
    })
    const timer = window.setInterval(() => {
      void handleLoad()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [handleLoad])

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8'>
      <section className='flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-3xl font-semibold text-slate-950'>Hoy</h1>
          <p className='mt-1 text-sm text-slate-500'>
            Hub operativo: alertas, caja del turno, ventas y medios de pago. Sin pantallas duplicadas.
          </p>
        </div>
        <button
          type='button'
          onClick={() => void handleLoad()}
          disabled={loading}
          aria-label='Refrescar dashboard de hoy'
          className='h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400'
        >
          {loading ? 'Cargando…' : 'Refrescar'}
        </button>
      </section>

      {error ? (
        <p role='alert' className='rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800'>
          {error}
        </p>
      ) : null}

      {hub ? (
        <>
          <section className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4' aria-label='Resumen de hoy'>
            <article className='rounded-xl border border-slate-200 bg-white p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-500'>Ventas hoy</p>
              <p className='mt-2 text-2xl font-semibold tabular-nums'>{formatMxnCurrency(hub.salesToday.total)}</p>
              <p className='text-xs text-slate-500'>{hub.salesToday.count} tickets</p>
              {hub.salesToday.discountTotal > 0 ? (
                <p className='text-xs text-emerald-700'>
                  Descuentos {formatMxnCurrency(hub.salesToday.discountTotal)}
                </p>
              ) : null}
            </article>
            <article className='rounded-xl border border-slate-200 bg-white p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-500'>Caja / turno</p>
              <p className='mt-2 text-lg font-semibold'>
                {hub.cash.outsideShiftHours
                  ? 'Fuera de horario'
                  : hub.cash.currentShiftSlot === 'morning'
                    ? 'Turno mañana'
                    : hub.cash.currentShiftSlot === 'afternoon'
                      ? 'Turno tarde'
                      : 'Sin turno'}
              </p>
              <p className='text-xs text-slate-500'>
                {hub.cash.openSession ? 'Sesión abierta' : 'Sin sesión abierta'}
              </p>
              <Link href='/caja' className='mt-2 inline-block text-xs font-semibold text-slate-800 underline'>
                Ir a Turno / Corte
              </Link>
            </article>
            <article className='rounded-xl border border-slate-200 bg-white p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-500'>Alertas</p>
              <p className='mt-2 text-2xl font-semibold'>{hub.alerts.totalCount}</p>
              <p className='text-xs text-slate-500'>
                Stock bajo {hub.alerts.lowStock.length} · Caducidad {hub.alerts.expiry.length}
              </p>
            </article>
            <article className='rounded-xl border border-slate-200 bg-white p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-500'>Atajos</p>
              <div className='mt-2 flex flex-wrap gap-2'>
                {hub.shortcuts.slice(0, 4).map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50'
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </article>
          </section>

          <section className='grid gap-3 sm:grid-cols-3' aria-label='Medios de pago hoy'>
            {(
              [
                { key: 'cash', label: 'Efectivo' },
                { key: 'card', label: 'Tarjeta' },
                { key: 'credit', label: 'Crédito' }
              ] as const
            ).map(item => (
              <article key={item.key} className='rounded-xl border border-slate-200 bg-white p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-500'>{item.label}</p>
                <p className='mt-2 text-xl font-semibold tabular-nums'>
                  {formatMxnCurrency(hub.paymentMethods[item.key].total)}
                </p>
                <p className='text-xs text-slate-500'>{hub.paymentMethods[item.key].count} tickets</p>
              </article>
            ))}
          </section>

          <section className='grid gap-4 lg:grid-cols-2' aria-label='Detalle de alertas'>
            <article className='rounded-xl border border-slate-200 bg-white p-4'>
              <h2 className='text-sm font-semibold text-slate-900'>Caducidad (1 día / vencidos)</h2>
              {hub.alerts.expiry.length === 0 ? (
                <p className='mt-2 text-sm text-slate-500'>Sin alertas de caducidad.</p>
              ) : (
                <ul className='mt-2 space-y-2'>
                  {hub.alerts.expiry.map(item => (
                    <li key={item.id} className='text-sm text-slate-700'>
                      <Link href={`/inventario/merma-caducidad?lotId=${item.id}`} className='underline'>
                        {item.productName} ({item.sku})
                      </Link>{' '}
                      · {item.expiresOn} ·{' '}
                      {formatStockQuantityLabel(item.quantityRemaining, Boolean(item.supportsWeight))}
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className='rounded-xl border border-slate-200 bg-white p-4'>
              <h2 className='text-sm font-semibold text-slate-900'>Stock bajo</h2>
              {hub.alerts.lowStock.length === 0 ? (
                <p className='mt-2 text-sm text-slate-500'>Sin stock bajo.</p>
              ) : (
                <ul className='mt-2 space-y-2'>
                  {hub.alerts.lowStock.map(item => {
                    const supportsWeight = Boolean(item.supportsWeight)
                    return (
                      <li key={item.id} className='text-sm text-slate-700'>
                        <Link href='/inventario' className='underline'>
                          {item.productName} ({item.sku})
                        </Link>{' '}
                        · Stock {formatStockQuantityLabel(item.stock, supportsWeight)} / Mínimo{' '}
                        {formatStockQuantityLabel(item.minStock, supportsWeight)}
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>
          </section>
        </>
      ) : null}
    </main>
  )
}
