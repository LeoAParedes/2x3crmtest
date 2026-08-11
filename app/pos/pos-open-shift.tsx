'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type PosOpenShiftProps = {
  username: string
}

export const PosOpenShift = ({ username }: PosOpenShiftProps) => {
  const router = useRouter()
  const [openingFloat, setOpeningFloat] = useState('500')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenShift = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const floatValue = Number(openingFloat.replace(',', '.'))
      if (!Number.isFinite(floatValue) || floatValue < 0) {
        throw new Error('Indica un fondo de caja válido')
      }
      const response = await fetch('/api/caja/session/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingFloat: floatValue })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible abrir el turno')
      }
      router.refresh()
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Error al abrir turno')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className='mx-auto flex max-w-lg flex-1 flex-col justify-center px-4 py-12 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <p className='text-xs font-medium uppercase tracking-wide text-emerald-700'>Punto de venta</p>
        <h1 className='mt-2 text-2xl font-semibold text-slate-950'>Abre tu turno para vender</h1>
        <p className='mt-2 text-sm text-slate-600'>
          Hola {username}. El POS necesita una caja abierta. Indica el fondo inicial y continúa sin salir del
          módulo.
        </p>

        <label className='mt-6 grid gap-1 text-sm text-slate-700'>
          Fondo de apertura (MXN)
          <input
            type='number'
            min='0'
            step='0.01'
            value={openingFloat}
            onChange={event => setOpeningFloat(event.target.value)}
            aria-label='Fondo de apertura'
            aria-invalid={Boolean(error)}
            className={`h-11 rounded-lg border px-3 ${
              error ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300'
            }`}
          />
        </label>

        {error ? (
          <p role='alert' className='mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
            {error}
          </p>
        ) : null}

        <button
          type='button'
          onClick={() => void handleOpenShift()}
          disabled={submitting}
          aria-label='Abrir turno y continuar al punto de venta'
          className='mt-5 h-11 w-full rounded-lg bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300'
        >
          {submitting ? 'Abriendo turno…' : 'Abrir turno y vender'}
        </button>

        <p className='mt-4 text-center text-xs text-slate-500'>
          El corte de caja se hace al final del turno desde Configuración → Turno / Corte.
        </p>
      </section>
    </main>
  )
}
