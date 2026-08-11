'use client'

import { useEffect, useState } from 'react'

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

export const ComprasClient = () => {
  const [restockItems, setRestockItems] = useState<RestockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/inventario?pageSize=200&page=1')
        const payload = (await response.json()) as InventoryResponse
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'No fue posible cargar inventario')
        }
        if (!cancelled) {
          const lowStock = (payload.items || [])
            .filter(item => item.stock <= item.minStock)
            .map(item => ({
              ...item,
              deficit: Math.max(0, item.minStock - item.stock + 1),
              estimatedCost: item.unitPrice * Math.max(1, item.minStock - item.stock + 1)
            }))
            .sort((left, right) => right.deficit - left.deficit)
          setRestockItems(lowStock)
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

  const estimatedRestockCost = restockItems.reduce((sum, item) => sum + item.estimatedCost, 0)

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='border-b border-slate-200 pb-5'>
        <h1 className='text-2xl font-semibold text-slate-950'>Compras y Proveedores</h1>
        <p className='mt-1 text-sm text-slate-600'>
          Lista de restock sugerida por productos en o bajo el mínimo de existencias.
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
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Unidades a pedir</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Costo est.</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {restockItems.map(item => (
              <tr key={item.id}>
                <td className='px-3 py-2 font-mono text-xs text-slate-600'>{item.sku}</td>
                <td className='px-3 py-2 text-sm font-medium text-slate-900'>{item.productName}</td>
                <td className='px-3 py-2 text-sm text-slate-700'>{item.category}</td>
                <td className='px-3 py-2 text-sm tabular-nums'>
                  <span className='font-semibold text-rose-700'>{item.stock}</span>
                </td>
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>{item.minStock}</td>
                <td className='px-3 py-2 text-sm tabular-nums font-semibold text-amber-800'>{item.deficit}</td>
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                  {formatMxnCurrency(item.estimatedCost)}
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

      {error ? (
        <p role='alert' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
