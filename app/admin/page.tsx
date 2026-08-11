'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type DashboardPayload = {
  success: boolean
  metrics: {
    generatedAt: string
    inventoryItems: number
    lowStockItems: number
    totalOrders: number
    openBalances: number
    openReturnCases: number
    openHandoffs: number
    pendingPaymentPromises: number
    pendingApprovals: number
    recentConversations: number
  }
}

const metricLabels: Record<Exclude<keyof DashboardPayload['metrics'], 'generatedAt'>, string> = {
  inventoryItems: 'Productos',
  lowStockItems: 'Stock bajo',
  totalOrders: 'Pedidos',
  openBalances: 'Saldos abiertos',
  openReturnCases: 'Devoluciones',
  openHandoffs: 'Handoffs',
  pendingPaymentPromises: 'Promesas',
  pendingApprovals: 'Aprobaciones',
  recentConversations: 'Conversaciones'
}

const MetricSkeleton = () => (
  <article className='animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm' aria-hidden='true'>
    <div className='h-2.5 w-20 rounded-full bg-slate-200' />
    <div className='mt-3 h-7 w-10 rounded-md bg-slate-200' />
  </article>
)

const SectionError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div
    role='alert'
    className='flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between'
  >
    <div className='flex items-center gap-3'>
      <span aria-hidden='true' className='shrink-0 text-rose-400'>
        ⚠
      </span>
      <p className='text-sm font-medium text-rose-800'>{message}</p>
    </div>
    <button
      type='button'
      onClick={onRetry}
      aria-label='Reintentar carga'
      className='shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400'
    >
      Reintentar
    </button>
  </div>
)

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  const handleLoadMetrics = useCallback(async () => {
    setLoadingMetrics(true)
    setMetricsError(null)
    try {
      const response = await fetch('/api/crm/dashboard')
      if (!response.ok) {
        throw new Error(`Error ${response.status}: no fue posible cargar el panel`)
      }
      const data = (await response.json()) as DashboardPayload
      setDashboard(data)
    } catch (error) {
      setMetricsError(error instanceof Error ? error.message : 'No fue posible cargar las métricas')
    } finally {
      setLoadingMetrics(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void handleLoadMetrics()
    })
  }, [handleLoadMetrics])

  const metricEntries = dashboard
    ? (Object.entries(metricLabels) as Array<[keyof typeof metricLabels, string]>)
    : []

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8'>
      <section className='flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-3xl font-semibold text-slate-950'>Panel administrativo</h1>
          <p className='mt-1 text-sm text-slate-500'>Métricas en tiempo real del ERP.</p>
        </div>
        <button
          type='button'
          onClick={() => void handleLoadMetrics()}
          disabled={loadingMetrics}
          aria-label='Refrescar métricas'
          className='h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
        >
          {loadingMetrics ? 'Cargando…' : 'Refrescar'}
        </button>
      </section>

      {metricsError ? (
        <SectionError message={metricsError} onRetry={handleLoadMetrics} />
      ) : loadingMetrics ? (
        <section
          aria-label='Cargando métricas'
          className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <MetricSkeleton key={i} />
          ))}
        </section>
      ) : dashboard ? (
        <section
          aria-label='Métricas del sistema'
          className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
        >
          {metricEntries.map(([key, label]) => (
            <article key={key} className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
              <p className='text-xs uppercase tracking-wide text-slate-500'>{label}</p>
              <p className='mt-2 text-2xl font-semibold text-slate-950'>{dashboard.metrics[key] ?? 0}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h2 className='text-lg font-semibold text-slate-950'>DavinciAi y punto de venta</h2>
        <p className='mt-2 text-sm text-slate-600'>
          La configuración del chatbot (Evolution API, herramientas ERP, IVA en recibo) vive en Configuración.
        </p>
        <div className='mt-4 flex flex-wrap gap-3'>
          <Link
            href='/configuracion?tab=chatbot'
            className='inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white'
            aria-label='Ir a configuración del chatbot'
          >
            Configurar chatbot
          </Link>
          <Link
            href='/configuracion?tab=general'
            className='inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700'
            aria-label='Ir a configuración general del POS'
          >
            IVA y recibo
          </Link>
        </div>
      </section>
    </main>
  )
}
