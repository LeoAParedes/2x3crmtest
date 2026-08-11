'use client'

import { useCallback, useEffect, useState } from 'react'

import { PROMO_TYPES, type PromoType } from '@/src/lib/finance/promotions-schema'

type Promotion = {
  id: string
  name: string
  type: PromoType
  value: number
  minPurchase: number
  description: string
  active: boolean
  expiresAt: string | null
  createdByUsername: string
  createdAt: string
}

const promoTypeLabels: Record<PromoType, string> = {
  porcentaje: 'Porcentaje (%)',
  monto_fijo: 'Monto fijo ($)',
  '2x1': '2 × 1',
  bundle: 'Paquete / bundle'
}

export const PromocionesClient = () => {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [promoType, setPromoType] = useState<PromoType>('porcentaje')
  const [value, setValue] = useState('')
  const [minPurchase, setMinPurchase] = useState('0')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [expiresAt, setExpiresAt] = useState('')

  const loadPromotions = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/finanzas/promociones')
      const payload = (await response.json()) as {
        success?: boolean
        promotions?: Promotion[]
        message?: string
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible cargar promociones')
      }
      setPromotions(payload.promotions || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error de carga')
    } finally {
      if (!soft) setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadPromotions(false)
    })
    const intervalId = window.setInterval(() => {
      void loadPromotions(true)
    }, 30000)
    return () => window.clearInterval(intervalId)
  }, [loadPromotions])

  const resetForm = () => {
    setName('')
    setPromoType('porcentaje')
    setValue('')
    setMinPurchase('0')
    setDescription('')
    setActive(true)
    setExpiresAt('')
  }

  const handleCreatePromotion = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    setMessage(null)

    const parsedValue = Number(value.replace(',', '.'))
    const parsedMinPurchase = Number(minPurchase.replace(',', '.'))
    if (!name.trim() || name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres')
      setSaving(false)
      return
    }
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      setError('Indica un valor válido')
      setSaving(false)
      return
    }
    if (!description.trim() || description.trim().length < 2) {
      setError('La descripción debe tener al menos 2 caracteres')
      setSaving(false)
      return
    }

    try {
      const response = await fetch('/api/finanzas/promociones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: promoType,
          value: parsedValue,
          minPurchase: Number.isFinite(parsedMinPurchase) ? parsedMinPurchase : 0,
          description: description.trim(),
          active,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null
        })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible crear la promoción')
      }
      setMessage('Promoción creada correctamente')
      setShowForm(false)
      resetForm()
      await loadPromotions(true)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (promotion: Promotion) => {
    setError(null)
    try {
      const response = await fetch(`/api/finanzas/promociones/${promotion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !promotion.active })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible actualizar la promoción')
      }
      await loadPromotions(true)
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Error al actualizar')
    }
  }

  const handleDeletePromotion = async (promotion: Promotion) => {
    if (!window.confirm(`¿Eliminar la promoción "${promotion.name}"?`)) return
    setError(null)
    try {
      const response = await fetch(`/api/finanzas/promociones/${promotion.id}`, {
        method: 'DELETE'
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible eliminar la promoción')
      }
      setMessage('Promoción eliminada')
      await loadPromotions(true)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Error al eliminar')
    }
  }

  const activeCount = promotions.filter(promo => promo.active).length
  const inactiveCount = promotions.length - activeCount

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold text-slate-950'>Descuentos y promociones</h1>
          <p className='mt-1 text-sm text-slate-600'>
            Administra promociones activas, descuentos por porcentaje o monto, y paquetes de productos.
          </p>
        </div>
        <button
          type='button'
          aria-label='Crear nueva promoción'
          onClick={() => setShowForm(current => !current)}
          className='h-10 self-start rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:self-auto'
        >
          {showForm ? 'Cancelar' : 'Nueva promoción'}
        </button>
      </section>

      <section className='mt-5 grid gap-3 sm:grid-cols-3'>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Promociones activas</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-emerald-800'>{activeCount}</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Inactivas</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{inactiveCount}</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Total definidas</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{promotions.length}</p>
        </article>
      </section>

      {showForm ? (
        <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
          <h2 className='text-lg font-semibold text-slate-950'>Nueva promoción</h2>
          <div className='mt-5 grid gap-4 sm:grid-cols-2'>
            <label className='grid gap-1 text-sm text-slate-700'>
              Nombre de la promoción
              <input
                type='text'
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder='Ej. Descuento de fin de semana'
                aria-label='Nombre de la promoción'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Tipo de descuento
              <select
                value={promoType}
                onChange={event => setPromoType(event.target.value as PromoType)}
                aria-label='Tipo de descuento'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                {PROMO_TYPES.map(type => (
                  <option key={type} value={type}>
                    {promoTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Valor ({promoType === 'porcentaje' ? '%' : '$'})
              <input
                type='number'
                min='0'
                step='0.01'
                value={value}
                onChange={event => setValue(event.target.value)}
                aria-label='Valor del descuento'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Compra mínima (MXN)
              <input
                type='number'
                min='0'
                step='0.01'
                value={minPurchase}
                onChange={event => setMinPurchase(event.target.value)}
                aria-label='Compra mínima'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700 sm:col-span-2'>
              Descripción
              <input
                type='text'
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder='Descripción corta para el cajero'
                aria-label='Descripción de la promoción'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Expira
              <input
                type='date'
                value={expiresAt}
                onChange={event => setExpiresAt(event.target.value)}
                aria-label='Fecha de expiración'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
            <label className='flex items-center gap-2 self-end text-sm text-slate-700'>
              <input
                type='checkbox'
                checked={active}
                onChange={event => setActive(event.target.checked)}
                aria-label='Promoción activa'
              />
              Activa al crear
            </label>
          </div>
          <div className='mt-4 flex gap-3'>
            <button
              type='button'
              disabled={saving || !name.trim() || !value || !description.trim()}
              onClick={() => void handleCreatePromotion()}
              aria-label='Guardar promoción'
              className='h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
            >
              {saving ? 'Guardando…' : 'Guardar promoción'}
            </button>
            <button
              type='button'
              aria-label='Cancelar'
              onClick={() => {
                setShowForm(false)
                resetForm()
              }}
              className='h-10 rounded-lg border border-slate-300 px-4 text-sm text-slate-700'
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      <section className='mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='border-b border-slate-200 px-4 py-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Promociones definidas</h2>
        </div>
        <table className='min-w-full divide-y divide-slate-200'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Nombre</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Tipo</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Valor</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Descripción</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Estado</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Acciones</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {promotions.map(promo => (
              <tr key={promo.id}>
                <td className='px-3 py-2 text-sm font-medium text-slate-900'>{promo.name}</td>
                <td className='px-3 py-2 text-sm text-slate-700'>{promoTypeLabels[promo.type]}</td>
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                  {promo.type === 'porcentaje' ? `${promo.value}%` : `$${promo.value}`}
                </td>
                <td className='max-w-xs px-3 py-2 text-sm text-slate-600'>{promo.description}</td>
                <td className='px-3 py-2 text-sm'>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      promo.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {promo.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className='px-3 py-2 text-sm'>
                  <div className='flex gap-2'>
                    <button
                      type='button'
                      onClick={() => void handleToggleActive(promo)}
                      aria-label={`${promo.active ? 'Desactivar' : 'Activar'} ${promo.name}`}
                      className='rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50'
                    >
                      {promo.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type='button'
                      onClick={() => void handleDeletePromotion(promo)}
                      aria-label={`Eliminar ${promo.name}`}
                      className='rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50'
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className='px-4 py-4 text-sm text-slate-500'>Cargando promociones…</p> : null}
        {!loading && !promotions.length ? (
          <p className='px-4 py-4 text-sm text-slate-500'>Sin promociones definidas aún.</p>
        ) : null}
      </section>

      {message ? (
        <p aria-live='polite' className='mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
