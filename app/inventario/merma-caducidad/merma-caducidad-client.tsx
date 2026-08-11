'use client'

import { useEffect, useMemo, useState } from 'react'

import { formatMxnCurrency } from '@/src/lib/mxn-currency'
import { isLowStockItem } from '@/src/lib/inventory/low-stock'

type InventoryItem = {
  id: string
  sku: string
  productName: string
  category: string
  stock: number
  minStock: number
  unitPrice: number
}

type ExpiryNote = {
  inventoryItemId: string
  expiresOn: string
  note: string
}

const EXPIRY_STORAGE_KEY = 'inventory_expiry_notes_v1'

const readExpiryNotes = (): ExpiryNote[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(EXPIRY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ExpiryNote[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeExpiryNotes = (notes: ExpiryNote[]) => {
  window.localStorage.setItem(EXPIRY_STORAGE_KEY, JSON.stringify(notes))
}

export const MermaCaducidadClient = () => {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('Merma')
  const [expiresOn, setExpiresOn] = useState('')
  const [expiryNote, setExpiryNote] = useState('')
  const [expiryNotes, setExpiryNotes] = useState<ExpiryNote[]>(() => readExpiryNotes())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/pos/inventory?page=1&pageSize=200')
        const payload = (await response.json()) as {
          success?: boolean
          items?: InventoryItem[]
          message?: string
        }
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'No fue posible cargar inventario')
        }
        if (!cancelled) {
          setItems(payload.items || [])
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

  const lowStock = useMemo(() => items.filter(item => isLowStockItem(item)), [items])
  const selected = items.find(item => item.id === selectedId) || null

  const notesByItem = useMemo(() => {
    const map = new Map<string, ExpiryNote>()
    for (const note of expiryNotes) {
      map.set(note.inventoryItemId, note)
    }
    return map
  }, [expiryNotes])

  const handleRegisterMerma = async () => {
    if (submitting || !selected) return
    setSubmitting(true)
    setMessage(null)
    setError(null)
    try {
      const qty = Number(quantity.replace(',', '.'))
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Indica una cantidad válida de merma')
      }
      const response = await fetch('/api/inventario/ajustes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: selected.id,
          operation: 'stock_exit',
          quantity: qty,
          reason: reason.trim() || 'Merma',
          valuationMethod: 'fifo'
        })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible registrar la merma')
      }
      setMessage(`Merma registrada en ${selected.productName}`)
      setQuantity('1')
      const refresh = await fetch('/api/pos/inventory?page=1&pageSize=200')
      const refreshPayload = (await refresh.json()) as { success?: boolean; items?: InventoryItem[] }
      if (refresh.ok && refreshPayload.success) {
        setItems(refreshPayload.items || [])
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Error al registrar merma')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveExpiry = () => {
    if (!selectedId || !expiresOn) {
      setError('Selecciona producto y fecha de caducidad')
      return
    }
    const nextNote: ExpiryNote = {
      inventoryItemId: selectedId,
      expiresOn,
      note: expiryNote.trim()
    }
    const next = [...expiryNotes.filter(item => item.inventoryItemId !== selectedId), nextNote]
    setExpiryNotes(next)
    writeExpiryNotes(next)
    setMessage('Fecha de caducidad guardada')
    setError(null)
  }

  return (
    <main className='mx-auto max-w-6xl px-4 py-8 md:px-8'>
      <section className='border-b border-slate-200 pb-5'>
        <h1 className='text-2xl font-semibold text-slate-950'>Merma y Caducidad</h1>
        <p className='mt-1 text-sm text-slate-600'>
          Registra salidas por merma y marca productos próximos a caducar.
        </p>
      </section>

      <div className='mt-6 grid gap-6 lg:grid-cols-2'>
        <section className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
          <h2 className='text-sm font-semibold text-slate-900'>Registrar merma</h2>
          <label className='mt-4 grid gap-1 text-sm text-slate-700'>
            Producto
            <select
              value={selectedId}
              onChange={event => setSelectedId(event.target.value)}
              aria-label='Producto para merma'
              className='h-10 rounded-lg border border-slate-300 px-3'
            >
              <option value=''>Selecciona…</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.productName} ({item.stock})
                </option>
              ))}
            </select>
          </label>
          <label className='mt-3 grid gap-1 text-sm text-slate-700'>
            Cantidad
            <input
              value={quantity}
              onChange={event => setQuantity(event.target.value)}
              aria-label='Cantidad de merma'
              className='h-10 rounded-lg border border-slate-300 px-3'
            />
          </label>
          <label className='mt-3 grid gap-1 text-sm text-slate-700'>
            Motivo
            <input
              value={reason}
              onChange={event => setReason(event.target.value)}
              aria-label='Motivo de merma'
              className='h-10 rounded-lg border border-slate-300 px-3'
            />
          </label>
          {selected ? (
            <p className='mt-2 text-xs text-slate-500'>
              Stock actual {selected.stock} · {formatMxnCurrency(selected.unitPrice)} c/u
            </p>
          ) : null}
          <button
            type='button'
            onClick={() => void handleRegisterMerma()}
            disabled={submitting || !selectedId}
            aria-label='Registrar merma'
            className='mt-4 h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
          >
            {submitting ? 'Registrando…' : 'Registrar merma'}
          </button>
        </section>

        <section className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
          <h2 className='text-sm font-semibold text-slate-900'>Caducidad</h2>
          <label className='mt-4 grid gap-1 text-sm text-slate-700'>
            Producto
            <select
              value={selectedId}
              onChange={event => setSelectedId(event.target.value)}
              aria-label='Producto para caducidad'
              className='h-10 rounded-lg border border-slate-300 px-3'
            >
              <option value=''>Selecciona…</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.productName}
                </option>
              ))}
            </select>
          </label>
          <label className='mt-3 grid gap-1 text-sm text-slate-700'>
            Fecha de caducidad
            <input
              type='date'
              value={expiresOn}
              onChange={event => setExpiresOn(event.target.value)}
              aria-label='Fecha de caducidad'
              className='h-10 rounded-lg border border-slate-300 px-3'
            />
          </label>
          <label className='mt-3 grid gap-1 text-sm text-slate-700'>
            Nota
            <input
              value={expiryNote}
              onChange={event => setExpiryNote(event.target.value)}
              aria-label='Nota de caducidad'
              className='h-10 rounded-lg border border-slate-300 px-3'
              placeholder='Lote, ubicación…'
            />
          </label>
          <button
            type='button'
            onClick={handleSaveExpiry}
            disabled={!selectedId}
            aria-label='Guardar caducidad'
            className='mt-4 h-10 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
          >
            Guardar caducidad
          </button>
        </section>
      </div>

      <section className='mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='border-b border-slate-200 px-4 py-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Alertas</h2>
        </div>
        <table className='min-w-full divide-y divide-slate-200'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>SKU</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Producto</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Stock</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Caduca</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Estado</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {[...lowStock, ...items.filter(item => notesByItem.has(item.id) && !isLowStockItem(item))]
              .slice(0, 40)
              .map(item => {
                const note = notesByItem.get(item.id)
                return (
                  <tr key={item.id}>
                    <td className='px-3 py-2 text-sm text-slate-700'>{item.sku}</td>
                    <td className='px-3 py-2 text-sm text-slate-900'>{item.productName}</td>
                    <td className='px-3 py-2 text-sm text-slate-700'>{item.stock}</td>
                    <td className='px-3 py-2 text-sm text-slate-700'>{note?.expiresOn || '—'}</td>
                    <td className='px-3 py-2 text-sm text-slate-700'>
                      {isLowStockItem(item) ? 'Stock bajo' : note ? 'Con caducidad' : '—'}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        {loading ? <p className='px-4 py-4 text-sm text-slate-500'>Cargando…</p> : null}
        {!loading && !lowStock.length && !expiryNotes.length ? (
          <p className='px-4 py-4 text-sm text-slate-500'>Sin alertas de merma o caducidad por ahora.</p>
        ) : null}
      </section>

      {error ? (
        <p role='alert' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
      {message ? (
        <p aria-live='polite' className='mt-4 text-sm text-emerald-700'>
          {message}
        </p>
      ) : null}
    </main>
  )
}
