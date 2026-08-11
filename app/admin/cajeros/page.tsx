'use client'

import { useEffect, useState } from 'react'

type CashierRow = {
  id: string
  username: string
  role: string
  isActive: boolean
  cashierGate: string
  createdAt: string
}

export default function CajerosAdminPage() {
  const [cashiers, setCashiers] = useState<CashierRow[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/admin/cashiers')
        const payload = (await response.json()) as { success?: boolean; cashiers?: CashierRow[]; message?: string }
        if (cancelled) return
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'No fue posible cargar cajeros')
        }
        setCashiers(payload.cashiers || [])
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Error de carga')
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

  const handleCreate = async () => {
    if (submitting) return
    setSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/cashiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible crear el cajero')
      }
      setUsername('')
      setPassword('')
      setMessage('Cajero creado correctamente')
      setLoading(true)
      try {
        const response = await fetch('/api/admin/cashiers')
        const payload = (await response.json()) as { success?: boolean; cashiers?: CashierRow[]; message?: string }
        if (response.ok && payload.success) {
          setCashiers(payload.cashiers || [])
        }
      } finally {
        setLoading(false)
      }    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al crear')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className='mx-auto max-w-4xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-2xl font-semibold text-slate-950'>Alta de cajeros</h1>
        <p className='mt-1 text-sm text-slate-600'>
          Crea usuarios de caja con usuario y contraseña. Cada venta queda registrada con ese cajero.
        </p>

        <div className='mt-5 grid gap-3 sm:grid-cols-2'>
          <label className='grid gap-1 text-sm text-slate-700'>
            Usuario
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder='ej. cajero2'
              className='h-10 rounded-lg border border-slate-300 px-3'
              aria-label='Usuario del cajero'
            />
          </label>
          <label className='grid gap-1 text-sm text-slate-700'>
            Contraseña
            <input
              type='password'
              value={password}
              onChange={event => setPassword(event.target.value)}
              className='h-10 rounded-lg border border-slate-300 px-3'
              aria-label='Contraseña del cajero'
            />
          </label>
        </div>
        <button
          type='button'
          onClick={() => void handleCreate()}
          disabled={submitting || username.trim().length < 3 || password.length < 8}
          aria-label='Crear cajero'
          className='mt-4 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
        >
          {submitting ? 'Creando…' : 'Crear cajero'}
        </button>
      </section>

      <section className='mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='border-b border-slate-200 px-4 py-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Cajeros registrados</h2>
        </div>
        <table className='min-w-full divide-y divide-slate-200'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Usuario</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Estado</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Gate</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Alta</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {cashiers.map(cashier => (
              <tr key={cashier.id}>
                <td className='px-3 py-2 text-sm font-medium text-slate-900'>{cashier.username}</td>
                <td className='px-3 py-2 text-sm text-slate-700'>{cashier.isActive ? 'Activo' : 'Inactivo'}</td>
                <td className='px-3 py-2 text-sm text-slate-700'>{cashier.cashierGate}</td>
                <td className='px-3 py-2 text-sm text-slate-700'>
                  {new Date(cashier.createdAt).toLocaleString('es-MX')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cashiers.length ? (
          <p className='px-4 py-4 text-sm text-slate-500'>{loading ? 'Cargando…' : 'Sin cajeros aún.'}</p>
        ) : null}
      </section>

      {message ? (
        <p aria-live='polite' className='mt-4 text-sm text-slate-700'>
          {message}
        </p>
      ) : null}
    </main>
  )
}
