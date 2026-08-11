'use client'

import { useEffect, useState } from 'react'

import { formatMxnCurrency } from '@/src/lib/mxn-currency'

type CashSession = {
  id: string
  cashierUsername: string
  status: string
  openingFloat: number
  cashSalesTotal: number
  cardSalesTotal: number
  expectedCash: number | null
  countedCash: number | null
}

export const FinanzasFondosClient = () => {
  const [sessions, setSessions] = useState<CashSession[]>([])
  const [openSession, setOpenSession] = useState<CashSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [sessionResponse, cortesResponse] = await Promise.all([
          fetch('/api/caja/session'),
          fetch('/api/caja/cortes')
        ])
        const sessionPayload = (await sessionResponse.json()) as {
          success?: boolean
          openSession?: CashSession | null
          message?: string
        }
        const cortesPayload = (await cortesResponse.json()) as {
          success?: boolean
          sessions?: CashSession[]
          message?: string
        }
        if (!sessionResponse.ok || !sessionPayload.success) {
          throw new Error(sessionPayload.message || 'No fue posible cargar fondos de caja')
        }
        if (!cortesResponse.ok || !cortesPayload.success) {
          throw new Error(cortesPayload.message || 'No fue posible cargar historial de cortes')
        }
        if (!cancelled) {
          setOpenSession(sessionPayload.openSession || null)
          setSessions(cortesPayload.sessions || [])
          setError(null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Error de carga')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const activeCash =
    (openSession?.openingFloat || 0) + (openSession?.cashSalesTotal || 0)

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='border-b border-slate-200 pb-5'>
        <h1 className='text-2xl font-semibold text-slate-950'>Fondos activo</h1>
        <p className='mt-1 text-sm text-slate-600'>Liquidez de caja abierta y cortes recientes.</p>
      </section>

      <section className='mt-5 grid gap-3 sm:grid-cols-3'>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Caja abierta</p>
          <p className='mt-2 text-xl font-semibold tabular-nums text-slate-950'>
            {formatMxnCurrency(activeCash)}
          </p>
          <p className='text-xs text-slate-500'>
            {openSession ? `Turno de ${openSession.cashierUsername}` : 'Sin turno abierto'}
          </p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Fondo inicial</p>
          <p className='mt-2 text-xl font-semibold tabular-nums text-slate-950'>
            {formatMxnCurrency(openSession?.openingFloat || 0)}
          </p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Ventas efectivo</p>
          <p className='mt-2 text-xl font-semibold tabular-nums text-emerald-800'>
            {formatMxnCurrency(openSession?.cashSalesTotal || 0)}
          </p>
        </article>
      </section>

      <section className='mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='border-b border-slate-200 px-4 py-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Cortes recientes</h2>
        </div>
        <table className='min-w-full divide-y divide-slate-200'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Cajero</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Esperado</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Contado</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Estado</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {sessions.slice(0, 20).map(session => (
              <tr key={session.id}>
                <td className='px-3 py-2 text-sm text-slate-800'>{session.cashierUsername}</td>
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                  {formatMxnCurrency(session.expectedCash || 0)}
                </td>
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                  {formatMxnCurrency(session.countedCash || 0)}
                </td>
                <td className='px-3 py-2 text-sm text-slate-700'>{session.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className='px-4 py-4 text-sm text-slate-500'>Cargando…</p> : null}
        {!loading && !sessions.length ? (
          <p className='px-4 py-4 text-sm text-slate-500'>Sin cortes registrados.</p>
        ) : null}
      </section>

      {error ? (
        <p role='alert' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
