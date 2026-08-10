'use client'

import { useEffect, useState } from 'react'

import { formatMxnCurrency } from '@/src/lib/mxn-currency'

type DashboardResponse = {
  success: boolean
  metrics: {
    openBalances: number
    pendingPaymentPromises: number
    totalOrders: number
    openReturnCases: number
  }
}

type SalesResponse = {
  success: boolean
  sales: Array<{
    id: string
    saleNumber: string
    total: number
    paymentMethod: string
    createdAt: string
  }>
}

export const FinanceClient = () => {
  const [metrics, setMetrics] = useState<DashboardResponse['metrics'] | null>(null)
  const [sales, setSales] = useState<SalesResponse['sales']>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [dashboardResponse, salesResponse] = await Promise.all([fetch('/api/crm/dashboard'), fetch('/api/pos/sales')])
        const dashboardPayload = (await dashboardResponse.json()) as DashboardResponse
        const salesPayload = (await salesResponse.json()) as SalesResponse

        if (!dashboardResponse.ok || !dashboardPayload.success) {
          throw new Error('No fue posible cargar métricas financieras')
        }
        if (!salesResponse.ok || !salesPayload.success) {
          throw new Error('No fue posible cargar ventas recientes')
        }
        if (cancelled) return
        setMetrics(dashboardPayload.metrics)
        setSales(salesPayload.sales.slice(0, 20))
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Error de carga')
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const salesTotal = sales.reduce((sum, sale) => sum + sale.total, 0)
  const cashTotal = sales.filter(sale => sale.paymentMethod === 'cash').reduce((sum, sale) => sum + sale.total, 0)
  const cardTotal = sales.filter(sale => sale.paymentMethod === 'card').reduce((sum, sale) => sum + sale.total, 0)

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-2xl font-semibold text-slate-950'>Finanzas del negocio</h1>
        <p className='mt-2 text-sm text-slate-600'>Resumen financiero y recaudación reciente para control operativo.</p>
      </section>

      <section className='mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Saldos abiertos</p>
          <p className='mt-1 text-2xl font-semibold text-slate-950'>{metrics?.openBalances ?? 0}</p>
        </article>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Promesas pendientes</p>
          <p className='mt-1 text-2xl font-semibold text-slate-950'>{metrics?.pendingPaymentPromises ?? 0}</p>
        </article>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Pedidos</p>
          <p className='mt-1 text-2xl font-semibold text-slate-950'>{metrics?.totalOrders ?? 0}</p>
        </article>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Devoluciones abiertas</p>
          <p className='mt-1 text-2xl font-semibold text-slate-950'>{metrics?.openReturnCases ?? 0}</p>
        </article>
      </section>

      <section className='mt-6 grid gap-4 lg:grid-cols-3'>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Recaudación (20 ventas)</p>
          <p className='mt-2 text-2xl font-semibold text-slate-950'>{formatMxnCurrency(salesTotal)}</p>
        </article>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Efectivo</p>
          <p className='mt-2 text-2xl font-semibold text-slate-950'>{formatMxnCurrency(cashTotal)}</p>
        </article>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Tarjeta</p>
          <p className='mt-2 text-2xl font-semibold text-slate-950'>{formatMxnCurrency(cardTotal)}</p>
        </article>
      </section>

      <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
        <h2 className='text-lg font-semibold text-slate-900'>Últimas ventas</h2>
        <div className='mt-3 overflow-x-auto'>
          <table className='min-w-full divide-y divide-slate-200'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Venta</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Pago</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Monto</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Fecha</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {sales.map(sale => (
                <tr key={sale.id}>
                  <td className='px-3 py-2 text-sm text-slate-700'>{sale.saleNumber}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>{sale.paymentMethod}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>{formatMxnCurrency(sale.total)}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>{new Date(sale.createdAt).toLocaleString('es-PE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sales.length ? <p className='px-3 py-4 text-sm text-slate-500'>Sin movimientos de ventas recientes.</p> : null}
        </div>
      </section>

      {message ? (
        <p aria-live='polite' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {message}
        </p>
      ) : null}
    </main>
  )
}
