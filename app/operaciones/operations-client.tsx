'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { formatMxnCurrency } from '@/src/lib/mxn-currency'
import type { CrmRole } from '@/src/lib/security/rbac'

type SalesResponse = {
  success: boolean
  sales: Array<{
    id: string
    saleNumber: string
    cashierUsername: string
    total: number
    paymentMethod: string
    createdAt: string
  }>
}

type DashboardResponse = {
  success: boolean
  metrics: {
    lowStockItems: number
    pendingApprovals: number
    openHandoffs: number
    openBalances: number
  }
}

type OperationsClientProps = {
  role: CrmRole
}

const quickCards = [
  {
    href: '/pos',
    title: 'Abrir punto de venta',
    description: 'Inicia cobros, tickets y cierre de caja.'
  },
  {
    href: '/inventario?shortcut=movimientos',
    title: 'Revisar movimientos',
    description: 'Consulta salidas por ventas y ajustes.'
  },
  {
    href: '/inventario?shortcut=ajuste',
    title: 'Registrar ajuste rápido',
    description: 'Corrige diferencias de stock en caliente.'
  },
  {
    href: '/finanzas',
    title: 'Control de finanzas',
    description: 'Visualiza saldos, cobranza y pendientes.'
  }
]

export const OperationsClient = ({ role }: OperationsClientProps) => {
  const [sales, setSales] = useState<SalesResponse['sales']>([])
  const [summary, setSummary] = useState<DashboardResponse['metrics'] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const salesResponse = await fetch('/api/pos/sales')
        const salesPayload = (await salesResponse.json()) as SalesResponse
        if (!salesResponse.ok || !salesPayload.success) {
          throw new Error('No fue posible cargar ventas recientes')
        }
        if (!cancelled) {
          setSales(salesPayload.sales.slice(0, 8))
        }

        if (role === 'admin') {
          const dashboardResponse = await fetch('/api/crm/dashboard')
          const dashboardPayload = (await dashboardResponse.json()) as DashboardResponse
          if (!dashboardResponse.ok || !dashboardPayload.success) {
            throw new Error('No fue posible cargar resumen operativo')
          }
          if (!cancelled) {
            setSummary(dashboardPayload.metrics)
          }
        }
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
  }, [role])

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-2xl font-semibold text-slate-950'>Operaciones del día</h1>
        <p className='mt-2 text-sm text-slate-600'>Accesos rápidos para caja, inventario y seguimiento de movimientos críticos.</p>
      </section>

      <section className='mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        {(role === 'cashier' ? quickCards.filter(card => card.href !== '/finanzas') : quickCards).map(card => (
          <Link key={card.href} href={card.href} className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow'>
            <h2 className='text-sm font-semibold text-slate-900'>{card.title}</h2>
            <p className='mt-1 text-sm text-slate-600'>{card.description}</p>
          </Link>
        ))}
      </section>

      {summary ? (
        <section className='mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <p className='text-xs uppercase tracking-wide text-slate-500'>Stock bajo</p>
            <p className='mt-1 text-2xl font-semibold text-slate-950'>{summary.lowStockItems}</p>
          </article>
          <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <p className='text-xs uppercase tracking-wide text-slate-500'>Aprobaciones</p>
            <p className='mt-1 text-2xl font-semibold text-slate-950'>{summary.pendingApprovals}</p>
          </article>
          <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <p className='text-xs uppercase tracking-wide text-slate-500'>Handoffs abiertos</p>
            <p className='mt-1 text-2xl font-semibold text-slate-950'>{summary.openHandoffs}</p>
          </article>
          <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <p className='text-xs uppercase tracking-wide text-slate-500'>Saldos abiertos</p>
            <p className='mt-1 text-2xl font-semibold text-slate-950'>{summary.openBalances}</p>
          </article>
        </section>
      ) : null}

      <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
        <h2 className='text-lg font-semibold text-slate-900'>Ventas recientes</h2>
        <div className='mt-3 overflow-x-auto'>
          <table className='min-w-full divide-y divide-slate-200'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Nro venta</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Caja</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Pago</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Total</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Fecha</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {sales.map(sale => (
                <tr key={sale.id}>
                  <td className='px-3 py-2 text-sm text-slate-700'>{sale.saleNumber}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>{sale.cashierUsername}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>{sale.paymentMethod}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>{formatMxnCurrency(sale.total)}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>{new Date(sale.createdAt).toLocaleString('es-PE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sales.length ? <p className='px-3 py-4 text-sm text-slate-500'>Sin ventas recientes en este turno.</p> : null}
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
