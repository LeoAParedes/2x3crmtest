'use client'

import { useCallback, useEffect, useState } from 'react'

import { formatStockQuantityLabel } from '@/src/lib/inventory/logbook-quantity'
import {
  getRestockDeficit,
  getRestockEstimatedCost
} from '@/src/lib/inventory/low-stock'
import { gramsToKilograms, kilogramsToGrams } from '@/src/lib/inventory/weight-units'
import { formatMxnCurrency } from '@/src/lib/mxn-currency'

type InventoryItem = {
  id: string
  sku: string
  productName: string
  category: string
  stock: number
  minStock: number
  unitPrice: number
  aisle: string | null
  supportsWeight: boolean
}

type InventoryResponse = {
  success: boolean
  items: InventoryItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  message?: string
}

type RestockItem = InventoryItem & {
  deficit: number
  estimatedCost: number
}

type PurchaseFormState = {
  inventoryItemId: string
  productName: string
  quantity: string
  unitCost: string
  reason: string
  registerExpense: boolean
  supportsWeight: boolean
}

export const ComprasClient = () => {
  const [restockItems, setRestockItems] = useState<RestockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState | null>(null)

  const loadRestock = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/pos/inventory?pageSize=200&page=1')
      const payload = (await response.json()) as InventoryResponse
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible cargar inventario')
      }
      const lowStock = (payload.items || [])
        .filter(item => item.stock <= item.minStock)
        .map(item => {
          const supportsWeight = item.supportsWeight ?? false
          const deficit = getRestockDeficit(item.stock, item.minStock)
          const estimatedCost = getRestockEstimatedCost(
            item.stock,
            item.minStock,
            item.unitPrice,
            supportsWeight
          )
          return {
            ...item,
            supportsWeight,
            deficit,
            estimatedCost
          }
        })
        .sort((left, right) => right.deficit - left.deficit)
      setRestockItems(lowStock)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error de carga')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadRestock()
    })
  }, [loadRestock])

  const handleOpenPurchaseForm = (item: RestockItem) => {
    setMessage(null)
    setError(null)
    const suggestedQuantity = item.supportsWeight
      ? gramsToKilograms(item.deficit).toFixed(3)
      : String(item.deficit || 1)
    setPurchaseForm({
      inventoryItemId: item.id,
      productName: item.productName,
      quantity: suggestedQuantity,
      unitCost: String(item.unitPrice),
      reason: 'Compra a proveedor',
      registerExpense: true,
      supportsWeight: item.supportsWeight
    })
  }

  const handleClosePurchaseForm = () => {
    setPurchaseForm(null)
  }

  const handleSubmitPurchase = async () => {
    if (!purchaseForm || submitting) return
    setSubmitting(true)
    setError(null)
    setMessage(null)

    const quantityInput = Number(purchaseForm.quantity.replace(',', '.'))
    const unitCost = Number(purchaseForm.unitCost.replace(',', '.'))
    if (!Number.isFinite(quantityInput) || quantityInput <= 0) {
      setError(
        purchaseForm.supportsWeight
          ? 'Indica una cantidad válida en kilogramos mayor a cero'
          : 'Indica una cantidad entera válida mayor a cero'
      )
      setSubmitting(false)
      return
    }
    if (!purchaseForm.supportsWeight && !Number.isInteger(quantityInput)) {
      setError('Indica una cantidad entera válida mayor a cero')
      setSubmitting(false)
      return
    }
    const quantity = purchaseForm.supportsWeight
      ? kilogramsToGrams(quantityInput)
      : Math.round(quantityInput)
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      setError('Indica un costo unitario válido mayor a cero')
      setSubmitting(false)
      return
    }
    if (purchaseForm.reason.trim().length < 3) {
      setError('El motivo debe tener al menos 3 caracteres')
      setSubmitting(false)
      return
    }

    try {
      const adjustmentResponse = await fetch('/api/inventario/ajustes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'stock_entry',
          inventoryItemId: purchaseForm.inventoryItemId,
          quantity,
          unitCost,
          reason: purchaseForm.reason.trim()
        })
      })
      const adjustmentPayload = (await adjustmentResponse.json()) as {
        success?: boolean
        message?: string
      }
      if (!adjustmentResponse.ok || !adjustmentPayload.success) {
        throw new Error(adjustmentPayload.message || 'No fue posible registrar la entrada de stock')
      }

      if (purchaseForm.registerExpense) {
        const totalAmount = quantity * unitCost
        const expenseResponse = await fetch('/api/finanzas/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'proveedores',
            description: purchaseForm.reason.trim(),
            amount: totalAmount,
            kind: 'operating'
          })
        })
        const expensePayload = (await expenseResponse.json()) as { success?: boolean; message?: string }
        if (!expenseResponse.ok || !expensePayload.success) {
          throw new Error(
            expensePayload.message || 'Stock actualizado, pero no se pudo registrar el gasto asociado'
          )
        }
      }

      setMessage('Compra registrada — stock actualizado')
      setPurchaseForm(null)
      await loadRestock()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Error al registrar compra')
    } finally {
      setSubmitting(false)
    }
  }

  const estimatedRestockCost = restockItems.reduce((sum, item) => sum + item.estimatedCost, 0)

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='border-b border-slate-200 pb-5'>
        <h1 className='text-2xl font-semibold text-slate-950'>Compras y Proveedores</h1>
        <p className='mt-1 text-sm text-slate-600'>
          Lista de restock sugerida y registro de compras que actualizan inventario y gastos.
        </p>
      </section>

      <section className='mt-5 grid gap-3 sm:grid-cols-3'>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Productos a reponer</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-rose-700'>{restockItems.length}</p>
          <p className='text-xs text-slate-500'>en o bajo stock mínimo</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Costo estimado restock</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>
            {formatMxnCurrency(estimatedRestockCost)}
          </p>
          <p className='text-xs text-slate-500'>basado en precio unitario</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Estado</p>
          <p className='mt-1 text-xl font-semibold text-slate-950'>
            {loading ? '…' : restockItems.length === 0 ? 'OK' : 'Acción requerida'}
          </p>
          <p
            className={`text-xs font-medium ${
              restockItems.length === 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {restockItems.length === 0 ? 'Inventario saludable' : `${restockItems.length} producto(s) crítico(s)`}
          </p>
        </article>
      </section>

      {purchaseForm ? (
        <section className='mt-6 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm'>
          <h2 className='text-lg font-semibold text-slate-950'>Registrar compra</h2>
          <p className='mt-1 text-sm text-slate-600'>Producto: {purchaseForm.productName}</p>
          <div className='mt-4 grid gap-3 sm:grid-cols-2'>
            <label className='grid gap-1 text-sm text-slate-700'>
              Cantidad {purchaseForm.supportsWeight ? '(kg)' : '(pz)'}
              <input
                type='number'
                min={purchaseForm.supportsWeight ? '0.001' : '1'}
                step={purchaseForm.supportsWeight ? '0.001' : '1'}
                value={purchaseForm.quantity}
                onChange={event =>
                  setPurchaseForm(current =>
                    current ? { ...current, quantity: event.target.value } : current
                  )
                }
                aria-label='Cantidad comprada'
                className='h-10 rounded-lg border border-slate-300 px-3'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Costo unitario (MXN)
              <input
                type='number'
                min='0.01'
                step='0.01'
                value={purchaseForm.unitCost}
                onChange={event =>
                  setPurchaseForm(current =>
                    current ? { ...current, unitCost: event.target.value } : current
                  )
                }
                aria-label='Costo unitario'
                className='h-10 rounded-lg border border-slate-300 px-3'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700 sm:col-span-2'>
              Motivo
              <input
                type='text'
                value={purchaseForm.reason}
                onChange={event =>
                  setPurchaseForm(current =>
                    current ? { ...current, reason: event.target.value } : current
                  )
                }
                aria-label='Motivo de la compra'
                className='h-10 rounded-lg border border-slate-300 px-3'
              />
            </label>
            <label className='flex items-center gap-2 text-sm text-slate-700 sm:col-span-2'>
              <input
                type='checkbox'
                checked={purchaseForm.registerExpense}
                onChange={event =>
                  setPurchaseForm(current =>
                    current ? { ...current, registerExpense: event.target.checked } : current
                  )
                }
                aria-label='Registrar como gasto en proveedores'
              />
              Registrar también como gasto en proveedores
            </label>
          </div>
          <div className='mt-4 flex gap-2'>
            <button
              type='button'
              onClick={() => void handleSubmitPurchase()}
              disabled={submitting}
              aria-label='Confirmar compra'
              className='h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
            >
              {submitting ? 'Registrando…' : 'Confirmar compra'}
            </button>
            <button
              type='button'
              onClick={handleClosePurchaseForm}
              aria-label='Cancelar compra'
              className='h-10 rounded-lg border border-slate-300 px-4 text-sm text-slate-700'
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      <section className='mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='border-b border-slate-200 px-4 py-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Lista de restock sugerida</h2>
          <p className='text-xs text-slate-500'>
            Productos con stock igual o menor al mínimo definido, ordenados por déficit.
          </p>
        </div>
        <table className='min-w-full divide-y divide-slate-200'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>SKU</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Producto</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Categoría</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Stock actual</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Mínimo</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Cantidad a pedir</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Costo est.</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Acción</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {restockItems.map(item => (
              <tr key={item.id}>
                <td className='px-3 py-2 font-mono text-xs text-slate-600'>{item.sku}</td>
                <td className='px-3 py-2 text-sm font-medium text-slate-900'>{item.productName}</td>
                <td className='px-3 py-2 text-sm text-slate-700'>{item.category}</td>
                <td className='px-3 py-2 text-sm tabular-nums'>
                  <span className='font-semibold text-rose-700'>
                    {formatStockQuantityLabel(item.stock, item.supportsWeight)}
                  </span>
                </td>
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                  {formatStockQuantityLabel(item.minStock, item.supportsWeight)}
                </td>
                <td className='px-3 py-2 text-sm tabular-nums font-semibold text-amber-800'>
                  {formatStockQuantityLabel(item.deficit, item.supportsWeight)}
                </td>
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                  {formatMxnCurrency(item.estimatedCost)}
                </td>
                <td className='px-3 py-2 text-sm'>
                  <button
                    type='button'
                    onClick={() => handleOpenPurchaseForm(item)}
                    aria-label={`Registrar compra de ${item.productName}`}
                    className='rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100'
                  >
                    Registrar compra
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className='px-4 py-4 text-sm text-slate-500'>Cargando inventario…</p> : null}
        {!loading && !restockItems.length ? (
          <p className='px-4 py-4 text-sm text-emerald-700'>
            Todos los productos están por encima del stock mínimo. No hay restock urgente.
          </p>
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
