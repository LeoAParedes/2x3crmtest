'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { formatMxnCurrency } from '@/src/lib/mxn-currency'
import type { CrmRole } from '@/src/lib/security/rbac'

type CashSession = {
  id: string
  cashierUsername: string
  status: 'open' | 'closed'
  openingFloat: number
  openedAt: string
  closedAt: string | null
  cashSalesTotal: number
  cardSalesTotal: number
  salesCount: number
  expectedCash: number | null
  countedCash: number | null
  variance: number | null
  notes: string | null
}

type CajaClientProps = {
  role: CrmRole
  username: string
}

export const CajaClient = ({ role, username }: CajaClientProps) => {
  const [gate, setGate] = useState<'ready' | 'on_shift' | 'must_logout'>('ready')
  const [session, setSession] = useState<CashSession | null>(null)
  const [history, setHistory] = useState<CashSession[]>([])
  const [exclusiveCashierSession, setExclusiveCashierSession] = useState<{
    cashierUsername: string
    openedAt: string
  } | null>(null)
  const [openingFloat, setOpeningFloat] = useState('500')
  const [countedCash, setCountedCash] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [closedResult, setClosedResult] = useState<CashSession | null>(null)
  const blockedByExclusiveSession = role === 'cashier' && Boolean(exclusiveCashierSession)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/caja/session')
        const payload = (await response.json()) as {
          success?: boolean
          gate?: 'ready' | 'on_shift' | 'must_logout'
          openSession?: CashSession | null
          exclusiveCashierSession?: { cashierUsername: string; openedAt: string } | null
          message?: string
        }
        if (cancelled) return
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'No fue posible cargar el turno')
        }
        setGate(payload.gate || 'ready')
        setSession(payload.openSession || null)
        setExclusiveCashierSession(payload.exclusiveCashierSession || null)

        if (role === 'admin') {
          const cortesResponse = await fetch('/api/caja/cortes')
          const cortesPayload = (await cortesResponse.json()) as {
            success?: boolean
            sessions?: CashSession[]
          }
          if (cortesResponse.ok && cortesPayload.success) {
            setHistory(cortesPayload.sessions || [])
          }
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Error al cargar caja')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [role])

  const handleOpenSession = async () => {
    if (submitting || blockedByExclusiveSession) return
    setSubmitting(true)
    setMessage(null)
    setClosedResult(null)
    try {
      const floatValue = Number(openingFloat.replace(',', '.'))
      const response = await fetch('/api/caja/session/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingFloat: floatValue })
      })
      const payload = (await response.json()) as { success?: boolean; session?: CashSession; message?: string }
      if (!response.ok || !payload.success || !payload.session) {
        throw new Error(payload.message || 'No fue posible abrir el turno')
      }
      setSession(payload.session)
      setGate('on_shift')
      setMessage('Turno abierto. Ya puedes operar el POS.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al abrir turno')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCloseSession = async () => {
    if (submitting) return
    setSubmitting(true)
    setMessage(null)
    try {
      const counted = Number(countedCash.replace(',', '.'))
      const response = await fetch('/api/caja/session/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countedCash: counted,
          notes: notes.trim() || undefined
        })
      })
      const payload = (await response.json()) as { success?: boolean; session?: CashSession; message?: string }
      if (!response.ok || !payload.success || !payload.session) {
        throw new Error(payload.message || 'No fue posible cerrar el turno')
      }
      setClosedResult(payload.session)
      setSession(null)
      setGate(role === 'cashier' ? 'must_logout' : 'ready')
      setCountedCash('')
      setNotes('')
      setMessage('Corte de caja registrado.')
      if (role === 'admin') {
        const cortesResponse = await fetch('/api/caja/cortes')
        const cortesPayload = (await cortesResponse.json()) as {
          success?: boolean
          sessions?: CashSession[]
        }
        if (cortesResponse.ok && cortesPayload.success) {
          setHistory(cortesPayload.sessions || [])
        }
      }    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cerrar turno')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p className='p-6 text-sm text-slate-600'>Cargando turno de caja…</p>
  }

  if (gate === 'must_logout' && role === 'cashier') {
    return (
      <main className='mx-auto max-w-lg px-4 py-10'>
        <section className='rounded-2xl border border-amber-200 bg-amber-50 p-6'>
          <h1 className='text-2xl font-semibold text-slate-950'>Corte completado</h1>
          <p className='mt-2 text-sm text-slate-700'>
            Hola {username}. El corte de caja quedó registrado. Solo puedes cerrar sesión ahora.
          </p>
          {closedResult ? (
            <div className='mt-4 space-y-1 text-sm text-slate-800'>
              <p>Esperado: {formatMxnCurrency(closedResult.expectedCash || 0)}</p>
              <p>Contado: {formatMxnCurrency(closedResult.countedCash || 0)}</p>
              <p className={(closedResult.variance || 0) === 0 ? 'text-emerald-700' : 'text-rose-700'}>
                Diferencia: {formatMxnCurrency(closedResult.variance || 0)}
              </p>
            </div>
          ) : null}
          <form action='/auth/logout' method='post' className='mt-6'>
            <button
              type='submit'
              aria-label='Cerrar sesión'
              className='h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white'
            >
              Cerrar sesión
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-2xl font-semibold text-slate-950'>Turno y corte de caja</h1>
        <p className='mt-1 text-sm text-slate-600'>
          Apertura y cierre por cajero. El conteo es ciego: no verás el efectivo esperado hasta confirmar el corte.
        </p>
        <p className='mt-3 text-xs uppercase tracking-wide text-slate-500'>Operador: {username}</p>
      </section>

      {!session ? (
        <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
          <h2 className='text-lg font-semibold text-slate-900'>Abrir turno</h2>
          {blockedByExclusiveSession && exclusiveCashierSession ? (
            <p
              role='alert'
              className='mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'
            >
              Solo puede haber un cajero en turno. Ahora opera{' '}
              <strong>{exclusiveCashierSession.cashierUsername}</strong>. El administrador no tiene este límite.
            </p>
          ) : null}
          {role === 'admin' ? (
            <p className='mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'>
              Como administrador puedes abrir turno aunque haya un cajero activo.
            </p>
          ) : null}
          <label className='mt-4 grid max-w-xs gap-1 text-sm text-slate-700'>
            Fondo inicial (efectivo)
            <input
              value={openingFloat}
              onChange={event => setOpeningFloat(event.target.value)}
              inputMode='decimal'
              disabled={blockedByExclusiveSession}
              className='h-10 rounded-lg border border-slate-300 px-3 disabled:bg-slate-100'
              aria-label='Fondo inicial de caja'
            />
          </label>
          <button
            type='button'
            onClick={() => void handleOpenSession()}
            disabled={submitting || blockedByExclusiveSession}
            aria-label='Abrir turno de caja'
            className='mt-4 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
          >
            {submitting ? 'Abriendo…' : 'Abrir turno'}
          </button>
          <p className='mt-3 text-sm text-slate-600'>
            Después de abrir, ve a{' '}
            <Link href='/pos' className='font-medium text-emerald-700 underline'>
              Punto de venta
            </Link>
            .
          </p>
        </section>
      ) : (
        <section className='mt-6 grid gap-6 lg:grid-cols-2'>
          <article className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
            <h2 className='text-lg font-semibold text-slate-900'>Turno abierto</h2>
            <dl className='mt-4 space-y-2 text-sm text-slate-700'>
              <div className='flex justify-between gap-3'>
                <dt>Inicio</dt>
                <dd>{new Date(session.openedAt).toLocaleString('es-MX')}</dd>
              </div>
              <div className='flex justify-between gap-3'>
                <dt>Fondo inicial</dt>
                <dd>{formatMxnCurrency(session.openingFloat)}</dd>
              </div>
              <div className='flex justify-between gap-3'>
                <dt>Ventas efectivo</dt>
                <dd>{formatMxnCurrency(session.cashSalesTotal)}</dd>
              </div>
              <div className='flex justify-between gap-3'>
                <dt>Ventas tarjeta</dt>
                <dd>{formatMxnCurrency(session.cardSalesTotal)}</dd>
              </div>
              <div className='flex justify-between gap-3'>
                <dt>Tickets</dt>
                <dd>{session.salesCount}</dd>
              </div>
            </dl>
            <Link
              href='/pos'
              className='mt-5 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white'
            >
              Ir al POS
            </Link>
          </article>

          <article className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
            <h2 className='text-lg font-semibold text-slate-900'>Corte de caja</h2>
            <p className='mt-1 text-xs text-slate-500'>Cuenta el efectivo físico y captura el total (conteo ciego).</p>
            <label className='mt-4 grid gap-1 text-sm text-slate-700'>
              Efectivo contado
              <input
                value={countedCash}
                onChange={event => setCountedCash(event.target.value)}
                inputMode='decimal'
                className='h-10 rounded-lg border border-slate-300 px-3'
                aria-label='Efectivo contado en caja'
              />
            </label>
            <label className='mt-3 grid gap-1 text-sm text-slate-700'>
              Notas (opcional)
              <input
                value={notes}
                onChange={event => setNotes(event.target.value)}
                className='h-10 rounded-lg border border-slate-300 px-3'
                aria-label='Notas del corte'
              />
            </label>
            <button
              type='button'
              onClick={() => void handleCloseSession()}
              disabled={submitting || !countedCash.trim()}
              aria-label='Confirmar corte de caja'
              className='mt-4 h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50'
            >
              {submitting ? 'Cerrando…' : 'Confirmar corte'}
            </button>
          </article>
        </section>
      )}

      {closedResult ? (
        <section className='mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6'>
          <h2 className='text-lg font-semibold text-slate-900'>Resultado del corte</h2>
          <div className='mt-3 grid gap-2 text-sm sm:grid-cols-3'>
            <p>Esperado: {formatMxnCurrency(closedResult.expectedCash || 0)}</p>
            <p>Contado: {formatMxnCurrency(closedResult.countedCash || 0)}</p>
            <p className={(closedResult.variance || 0) === 0 ? 'text-emerald-700' : 'font-semibold text-rose-700'}>
              Diferencia: {formatMxnCurrency(closedResult.variance || 0)}
            </p>
          </div>
        </section>
      ) : null}

      {role === 'admin' && history.length ? (
        <section className='mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'>
          <div className='border-b border-slate-200 px-4 py-3'>
            <h2 className='text-sm font-semibold text-slate-900'>Historial de cortes</h2>
          </div>
          <table className='min-w-full divide-y divide-slate-200'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Cajero</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Apertura</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Estado</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Esperado</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Contado</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Dif.</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {history.map(item => (
                <tr key={item.id}>
                  <td className='px-3 py-2 text-sm text-slate-800'>{item.cashierUsername}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>
                    {new Date(item.openedAt).toLocaleString('es-MX')}
                  </td>
                  <td className='px-3 py-2 text-sm text-slate-700'>{item.status}</td>
                  <td className='px-3 py-2 text-sm text-slate-700'>
                    {item.expectedCash === null ? '—' : formatMxnCurrency(item.expectedCash)}
                  </td>
                  <td className='px-3 py-2 text-sm text-slate-700'>
                    {item.countedCash === null ? '—' : formatMxnCurrency(item.countedCash)}
                  </td>
                  <td
                    className={`px-3 py-2 text-sm ${
                      (item.variance || 0) === 0 ? 'text-slate-700' : 'font-medium text-rose-700'
                    }`}
                  >
                    {item.variance === null ? '—' : formatMxnCurrency(item.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {message ? (
        <p aria-live='polite' className='mt-4 text-sm text-slate-700'>
          {message}
        </p>
      ) : null}
    </main>
  )
}
