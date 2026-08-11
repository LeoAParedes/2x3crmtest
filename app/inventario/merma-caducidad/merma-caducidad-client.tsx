'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { formatStockQuantityLabel } from '@/src/lib/inventory/logbook-quantity'
import { kilogramsToGrams } from '@/src/lib/inventory/weight-units'

type InventoryLot = {
  id: string
  purchaseId: string
  inventoryItemId: string
  sku: string
  productName: string
  quantityReceived: number
  quantityRemaining: number
  expiresOn: string
  status: string
  alertKind: 'expiring' | 'expired' | null
  supportsWeight: boolean
}

const defaultQuantityForLot = (lot: InventoryLot | null) => {
  if (!lot) return '1'
  return lot.supportsWeight ? '0.100' : '1'
}

export const MermaCaducidadClient = () => {
  const searchParams = useSearchParams()
  const preselectedLotId = searchParams.get('lotId') || ''

  const [lots, setLots] = useState<InventoryLot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [manualLotId, setManualLotId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('Merma por caducidad')
  const [submitting, setSubmitting] = useState(false)

  const selectedLotId = manualLotId || preselectedLotId

  const loadLots = async () => {
    const response = await fetch('/api/inventario/lotes')
    const payload = (await response.json()) as {
      success?: boolean
      lots?: InventoryLot[]
      message?: string
    }
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'No fue posible cargar lotes')
    }
    setLots(
      (payload.lots || []).map(lot => ({
        ...lot,
        supportsWeight: Boolean(lot.supportsWeight)
      }))
    )
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        await loadLots()
        if (!cancelled) setError(null)
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

  const alertLots = useMemo(
    () => lots.filter(lot => lot.alertKind === 'expired' || lot.alertKind === 'expiring'),
    [lots]
  )
  const selected = lots.find(lot => lot.id === selectedLotId) || null
  const unitLabel = selected?.supportsWeight ? 'kg' : 'pz'

  useEffect(() => {
    const lot = lots.find(item => item.id === selectedLotId) || null
    setQuantity(defaultQuantityForLot(lot))
  }, [selectedLotId, lots])

  const handleSelectLot = (lotId: string) => {
    setManualLotId(lotId)
    setMessage(null)
    setError(null)
  }

  const handleRegisterMerma = async () => {
    if (submitting || !selected) return
    setSubmitting(true)
    setMessage(null)
    setError(null)
    try {
      const qtyInput = Number(quantity.replace(',', '.'))
      if (!Number.isFinite(qtyInput) || qtyInput <= 0) {
        throw new Error(`Indica una cantidad válida en ${unitLabel}`)
      }

      const storedQty = selected.supportsWeight
        ? kilogramsToGrams(qtyInput)
        : Math.round(qtyInput)

      if (!Number.isInteger(storedQty) || storedQty <= 0) {
        throw new Error(`Cantidad inválida en ${unitLabel}`)
      }
      if (storedQty > selected.quantityRemaining) {
        throw new Error(
          `La cantidad supera el restante del lote (${formatStockQuantityLabel(selected.quantityRemaining, selected.supportsWeight)})`
        )
      }

      const response = await fetch('/api/inventario/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotId: selected.id,
          quantity: storedQty,
          reason: reason.trim() || 'Merma por caducidad'
        })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible registrar la salida del lote')
      }

      setMessage(
        `Salida registrada del lote ${selected.sku} · ${formatStockQuantityLabel(storedQty, selected.supportsWeight)} · caduca ${selected.expiresOn}`
      )
      setQuantity(defaultQuantityForLot(selected))
      await loadLots()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Error al registrar merma')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='border-b border-slate-200 pb-5'>
        <h1 className='text-2xl font-semibold text-slate-950'>Merma y caducidad</h1>
        <p className='mt-1 text-sm text-slate-600'>
          La caducidad vive en Supabase por lote de compra. Da salida solo del lote seleccionado (FEFO).
        </p>
        <p className='mt-2 text-xs text-slate-500'>
          Para registrar una fecha nueva, usa{' '}
          <Link href='/finanzas/compras' className='font-medium text-slate-800 underline'>
            Compras y proveedores
          </Link>{' '}
          e indica la caducidad del lote al dar entrada. Unidades: kg o pz según el producto.
        </p>
      </section>

      {loading ? <p className='mt-6 text-sm text-slate-600'>Cargando lotes…</p> : null}
      {error ? (
        <p className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800' role='alert'>
          {error}
        </p>
      ) : null}
      {message ? (
        <p className='mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'>
          {message}
        </p>
      ) : null}

      <section className='mt-6 rounded-xl border border-slate-200 bg-white p-4' aria-label='Alertas de caducidad'>
        <h2 className='text-sm font-semibold text-slate-900'>Alertas (1 día antes y vencidos)</h2>
        {alertLots.length === 0 ? (
          <p className='mt-2 text-sm text-slate-500'>Sin lotes próximos a caducar ni vencidos.</p>
        ) : (
          <ul className='mt-3 divide-y divide-slate-100'>
            {alertLots.map(lot => (
              <li key={lot.id} className='flex flex-wrap items-center justify-between gap-2 py-2 text-sm'>
                <div>
                  <p className='font-medium text-slate-900'>
                    {lot.productName}{' '}
                    <span className='text-xs font-normal text-slate-500'>({lot.sku})</span>
                  </p>
                  <p className='text-xs text-slate-600'>
                    Caduca {lot.expiresOn} · restante{' '}
                    {formatStockQuantityLabel(lot.quantityRemaining, lot.supportsWeight)} ·{' '}
                    {lot.alertKind === 'expired' ? 'Vencido' : 'Caduca mañana'}
                  </p>
                </div>
                <button
                  type='button'
                  aria-label={`Seleccionar lote ${lot.sku} para salida`}
                  onClick={() => handleSelectLot(lot.id)}
                  className='rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50'
                >
                  Seleccionar lote
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className='mt-6 rounded-xl border border-slate-200 bg-white p-4' aria-label='Salida de lote'>
        <h2 className='text-sm font-semibold text-slate-900'>Dar salida por merma (lote)</h2>
        <div className='mt-3 grid gap-3 sm:grid-cols-2'>
          <label className='grid gap-1 text-xs font-medium text-slate-600'>
            Lote
            <select
              value={selectedLotId}
              onChange={event => handleSelectLot(event.target.value)}
              aria-label='Seleccionar lote'
              className='h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm'
            >
              <option value=''>Selecciona un lote</option>
              {lots.map(lot => (
                <option key={lot.id} value={lot.id}>
                  {lot.productName} · {lot.sku} · caduca {lot.expiresOn} ·{' '}
                  {formatStockQuantityLabel(lot.quantityRemaining, lot.supportsWeight)}
                </option>
              ))}
            </select>
          </label>
          <label className='grid gap-1 text-xs font-medium text-slate-600'>
            Cantidad a sacar ({unitLabel})
            <input
              type='text'
              inputMode='decimal'
              value={quantity}
              onChange={event => setQuantity(event.target.value)}
              aria-label={`Cantidad de merma del lote en ${unitLabel}`}
              disabled={!selected}
              className='h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums disabled:bg-slate-100'
            />
          </label>
          <label className='grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2'>
            Motivo
            <input
              type='text'
              value={reason}
              onChange={event => setReason(event.target.value)}
              aria-label='Motivo de merma'
              className='h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm'
            />
          </label>
        </div>
        {selected ? (
          <p className='mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700'>
            Lote seleccionado: <strong>{selected.productName}</strong> ({selected.sku}) · unidad{' '}
            <strong>{unitLabel}</strong> · restante{' '}
            {formatStockQuantityLabel(selected.quantityRemaining, selected.supportsWeight)} · caduca{' '}
            {selected.expiresOn}
          </p>
        ) : null}
        <button
          type='button'
          aria-label='Registrar salida del lote'
          disabled={submitting || !selected}
          onClick={() => void handleRegisterMerma()}
          className='mt-4 h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50'
        >
          {submitting ? 'Registrando…' : 'Registrar salida del lote'}
        </button>
      </section>
    </main>
  )
}
