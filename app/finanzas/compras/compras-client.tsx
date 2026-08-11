'use client'

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'

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
  message?: string
}

type Supplier = {
  id: string
  name: string
  phone: string | null
  email: string | null
  creditLimit: number
  openBalance: number
  isActive: boolean
}

type PurchaseRow = {
  id: string
  quantity: number
  unitCost: number
  totalAmount: number
  paymentStatus: string
  soldByName: string | null
  expiresOn: string | null
  purchasedAt: string
  createdByUsername: string
  supplier: { id: string; name: string; openBalance: number }
  product: { sku: string; productName: string; supportsWeight: boolean }
}

type RestockItem = InventoryItem & {
  deficit: number
  estimatedCost: number
}

type EntryForm = {
  inventoryItemId: string
  productName: string
  sku: string
  supportsWeight: boolean
  quantity: string
  unitCost: string
  supplierId: string
  newSupplierName: string
  paymentStatus: 'paid' | 'credit'
  soldByName: string
  reason: string
  expiresOn: string
}

const emptyEntry = (): EntryForm => ({
  inventoryItemId: '',
  productName: '',
  sku: '',
  supportsWeight: false,
  quantity: '1',
  unitCost: '',
  supplierId: '',
  newSupplierName: '',
  paymentStatus: 'paid',
  soldByName: '',
  reason: 'Compra a proveedor',
  expiresOn: ''
})

export const ComprasClient = () => {
  const [restockItems, setRestockItems] = useState<RestockItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [entryOpen, setEntryOpen] = useState(false)
  const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntry)
  const [searchField, setSearchField] = useState<'sku' | 'productName'>('productName')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([])
  const [searching, setSearching] = useState(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [inventoryResponse, suppliersResponse, purchasesResponse] = await Promise.all([
        fetch('/api/pos/inventory?pageSize=200&page=1&alertsOnly=true'),
        fetch('/api/finanzas/proveedores'),
        fetch('/api/finanzas/compras/entrada')
      ])

      const inventoryPayload = (await inventoryResponse.json()) as InventoryResponse & {
        items?: InventoryItem[]
      }
      const suppliersPayload = (await suppliersResponse.json()) as {
        success?: boolean
        suppliers?: Supplier[]
        message?: string
      }
      const purchasesPayload = (await purchasesResponse.json()) as {
        success?: boolean
        purchases?: PurchaseRow[]
        message?: string
      }

      if (!inventoryResponse.ok || !inventoryPayload.success) {
        throw new Error(inventoryPayload.message || 'No fue posible cargar inventario')
      }
      if (!suppliersResponse.ok || !suppliersPayload.success) {
        throw new Error(suppliersPayload.message || 'No fue posible cargar proveedores')
      }
      if (!purchasesResponse.ok || !purchasesPayload.success) {
        throw new Error(purchasesPayload.message || 'No fue posible cargar compras')
      }

      const lowStock = (inventoryPayload.items || [])
        .map(item => {
          const supportsWeight = item.supportsWeight ?? false
          return {
            ...item,
            supportsWeight,
            deficit: getRestockDeficit(item.stock, item.minStock),
            estimatedCost: getRestockEstimatedCost(
              item.stock,
              item.minStock,
              item.unitPrice,
              supportsWeight
            )
          }
        })
        .sort((left, right) => right.deficit - left.deficit)

      setRestockItems(lowStock)
      setSuppliers(suppliersPayload.suppliers || [])
      setPurchases(purchasesPayload.purchases || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error de carga')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadDashboard()
    })
  }, [loadDashboard])

  useEffect(() => {
    if (!entryOpen) return
    const query = searchQuery.trim()
    if (query.length < 1) {
      queueMicrotask(() => setSearchResults([]))
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true)
        try {
          const params = new URLSearchParams({
            q: query,
            searchField,
            page: '1',
            pageSize: '12'
          })
          const response = await fetch(`/api/pos/inventory?${params.toString()}`)
          const payload = (await response.json()) as InventoryResponse
          if (cancelled) return
          if (!response.ok || !payload.success) {
            setSearchResults([])
            return
          }
          setSearchResults(payload.items || [])
        } catch {
          if (!cancelled) setSearchResults([])
        } finally {
          if (!cancelled) setSearching(false)
        }
      })()
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [entryOpen, searchQuery, searchField])

  const handleOpenEntry = () => {
    setMessage(null)
    setError(null)
    setEntryForm(emptyEntry())
    setSearchQuery('')
    setSearchResults([])
    setEntryOpen(true)
  }

  const handleSelectProduct = (item: InventoryItem) => {
    setEntryForm(current => ({
      ...current,
      inventoryItemId: item.id,
      productName: item.productName,
      sku: item.sku,
      supportsWeight: item.supportsWeight,
      unitCost: current.unitCost || String(item.unitPrice),
      quantity: current.quantity || (item.supportsWeight ? '0.100' : '1')
    }))
    setSearchQuery('')
    setSearchResults([])
  }

  const handleSelectProductKeyDown = (event: KeyboardEvent<HTMLButtonElement>, item: InventoryItem) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleSelectProduct(item)
  }

  const handleQuickRestock = (item: RestockItem) => {
    handleOpenEntry()
    setEntryForm({
      ...emptyEntry(),
      inventoryItemId: item.id,
      productName: item.productName,
      sku: item.sku,
      supportsWeight: item.supportsWeight,
      quantity: item.supportsWeight
        ? gramsToKilograms(item.deficit).toFixed(3)
        : String(Math.max(item.deficit, 1)),
      unitCost: String(item.unitPrice)
    })
  }

  const handleSubmitEntry = async () => {
    if (!entryForm.inventoryItemId) {
      setError('Selecciona un producto desde el buscador')
      return
    }
    if (!entryForm.supplierId && entryForm.newSupplierName.trim().length < 2) {
      setError('Selecciona un proveedor o escribe uno nuevo')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryForm.expiresOn)) {
      setError('Indica la fecha de caducidad del lote (obligatoria)')
      return
    }

    const quantityNumber = Number(entryForm.quantity.replace(',', '.'))
    const unitCost = Number(entryForm.unitCost.replace(',', '.'))
    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      setError('Cantidad inválida')
      return
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      setError('Costo unitario inválido')
      return
    }

    const quantity = entryForm.supportsWeight
      ? kilogramsToGrams(quantityNumber)
      : Math.round(quantityNumber)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Cantidad inválida para inventario')
      return
    }

    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/finanzas/compras/entrada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: entryForm.inventoryItemId,
          supplierId: entryForm.supplierId || undefined,
          newSupplierName: entryForm.supplierId ? undefined : entryForm.newSupplierName.trim(),
          quantity,
          unitCost,
          paymentStatus: entryForm.paymentStatus,
          soldByName: entryForm.soldByName.trim() || undefined,
          reason: entryForm.reason.trim() || 'Compra a proveedor',
          expiresOn: entryForm.expiresOn
        })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible registrar la entrada')
      }
      setMessage(payload.message || 'Entrada registrada')
      setEntryOpen(false)
      setEntryForm(emptyEntry())
      await loadDashboard()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className='mx-auto max-w-6xl px-4 py-8 md:px-8'>
      <section className='flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold text-slate-950'>Compras y proveedores</h1>
          <p className='mt-1 text-sm text-slate-600'>
            Entradas de inventario con proveedor · contado (egreso) o crédito (cuenta por pagar).
          </p>
        </div>
        <button
          type='button'
          aria-label='Registrar entrada de compra'
          onClick={handleOpenEntry}
          className='h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800'
        >
          Registrar entrada
        </button>
      </section>

      {entryOpen ? (
        <section
          className='mt-4 rounded-xl border border-slate-900/10 bg-slate-50 p-4'
          aria-label='Formulario registrar entrada'
        >
          <div className='flex items-start justify-between gap-3'>
            <div>
              <h2 className='text-sm font-semibold text-slate-900'>Nueva entrada</h2>
              <p className='mt-0.5 text-xs text-slate-500'>
                Busca por SKU o nombre. La lista inicia vacía hasta que escribas.
              </p>
            </div>
            <button
              type='button'
              aria-label='Cerrar formulario de entrada'
              onClick={() => setEntryOpen(false)}
              className='rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700'
            >
              Cerrar
            </button>
          </div>

          <div className='mt-3 grid gap-3 sm:grid-cols-[140px_1fr]'>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              Buscar por
              <select
                value={searchField}
                onChange={event => setSearchField(event.target.value as 'sku' | 'productName')}
                aria-label='Campo de búsqueda'
                className='h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm'
              >
                <option value='productName'>Nombre</option>
                <option value='sku'>SKU</option>
              </select>
            </label>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              Producto
              <input
                type='search'
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={searchField === 'sku' ? 'Escribe SKU…' : 'Escribe nombre…'}
                aria-label='Buscar producto'
                className='h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm'
              />
            </label>
          </div>

          {searchQuery.trim() ? (
            <div className='mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white'>
              {searching ? (
                <p className='px-3 py-2 text-sm text-slate-500'>Buscando…</p>
              ) : searchResults.length ? (
                <ul role='listbox' aria-label='Resultados de productos'>
                  {searchResults.map(item => (
                    <li key={item.id}>
                      <button
                        type='button'
                        role='option'
                        aria-selected={entryForm.inventoryItemId === item.id}
                        tabIndex={0}
                        aria-label={`Elegir ${item.productName} ${item.sku}`}
                        onClick={() => handleSelectProduct(item)}
                        onKeyDown={event => handleSelectProductKeyDown(event, item)}
                        className='flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50'
                      >
                        <span>
                          <span className='font-medium text-slate-900'>{item.productName}</span>
                          <span className='ml-2 text-xs text-slate-500'>{item.sku}</span>
                        </span>
                        <span className='tabular-nums text-xs text-slate-600'>
                          Stock {item.stock} · {formatMxnCurrency(item.unitPrice)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='px-3 py-2 text-sm text-slate-500'>Sin coincidencias</p>
              )}
            </div>
          ) : (
            <p className='mt-2 text-xs text-slate-500'>Escribe para ver productos del inventario.</p>
          )}

          {entryForm.inventoryItemId ? (
            <p className='mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'>
              Seleccionado: <strong>{entryForm.productName}</strong> ({entryForm.sku})
            </p>
          ) : null}

          <div className='mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              Cantidad {entryForm.supportsWeight ? '(kg)' : '(pz)'}
              <input
                type='text'
                inputMode='decimal'
                value={entryForm.quantity}
                onChange={event => setEntryForm(current => ({ ...current, quantity: event.target.value }))}
                aria-label='Cantidad de entrada'
                className='h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums'
              />
            </label>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              Costo unitario
              <input
                type='text'
                inputMode='decimal'
                value={entryForm.unitCost}
                onChange={event => setEntryForm(current => ({ ...current, unitCost: event.target.value }))}
                aria-label='Costo unitario'
                className='h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums'
              />
            </label>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              Caducidad del lote
              <input
                type='date'
                value={entryForm.expiresOn}
                onChange={event => setEntryForm(current => ({ ...current, expiresOn: event.target.value }))}
                aria-label='Fecha de caducidad del lote'
                required
                className='h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm'
              />
            </label>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              Forma de pago
              <select
                value={entryForm.paymentStatus}
                onChange={event =>
                  setEntryForm(current => ({
                    ...current,
                    paymentStatus: event.target.value as 'paid' | 'credit'
                  }))
                }
                aria-label='Forma de pago'
                className='h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm'
              >
                <option value='paid'>Contado (egreso en finanzas)</option>
                <option value='credit'>Crédito (cuenta por pagar)</option>
              </select>
            </label>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              Proveedor existente
              <select
                value={entryForm.supplierId}
                onChange={event =>
                  setEntryForm(current => ({
                    ...current,
                    supplierId: event.target.value,
                    newSupplierName: event.target.value ? '' : current.newSupplierName
                  }))
                }
                aria-label='Proveedor existente'
                className='h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm'
              >
                <option value=''>Seleccionar…</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                    {supplier.openBalance > 0 ? ` · debe ${formatMxnCurrency(supplier.openBalance)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              O crear proveedor
              <input
                type='text'
                value={entryForm.newSupplierName}
                disabled={Boolean(entryForm.supplierId)}
                onChange={event =>
                  setEntryForm(current => ({ ...current, newSupplierName: event.target.value }))
                }
                placeholder='Nombre del proveedor'
                aria-label='Nombre de proveedor nuevo'
                className='h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100'
              />
            </label>
            <label className='grid gap-1 text-xs font-medium text-slate-600'>
              Vendido / entregado por
              <input
                type='text'
                value={entryForm.soldByName}
                onChange={event => setEntryForm(current => ({ ...current, soldByName: event.target.value }))}
                aria-label='Persona que vendió o entregó'
                className='h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm'
              />
            </label>
          </div>

          <div className='mt-3 flex flex-wrap gap-2'>
            <button
              type='button'
              disabled={submitting}
              onClick={() => void handleSubmitEntry()}
              aria-label='Guardar entrada de compra'
              className='h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60'
            >
              {submitting ? 'Guardando…' : 'Guardar entrada'}
            </button>
          </div>
        </section>
      ) : null}

      <section className='mt-6 grid gap-4 lg:grid-cols-2'>
        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Proveedores · cuentas por pagar</h2>
          <p className='mt-0.5 text-xs text-slate-500'>Saldo abierto por crédito</p>
          <div className='mt-3 overflow-x-auto'>
            <table className='min-w-full divide-y divide-slate-200'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                    Proveedor
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                    Por pagar
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                    Límite
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {suppliers.map(supplier => (
                  <tr key={supplier.id}>
                    <td className='px-3 py-2 text-sm text-slate-800'>{supplier.name}</td>
                    <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                      {formatMxnCurrency(supplier.openBalance)}
                    </td>
                    <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                      {formatMxnCurrency(supplier.creditLimit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!suppliers.length ? (
              <p className='px-3 py-4 text-sm text-slate-500'>
                {loading ? 'Cargando…' : 'Aún no hay proveedores. Créalos al registrar una entrada.'}
              </p>
            ) : null}
          </div>
        </article>

        <article className='border border-slate-200 bg-white p-4'>
          <h2 className='text-sm font-semibold text-slate-900'>Compras recientes</h2>
          <div className='mt-3 overflow-x-auto'>
            <table className='min-w-full divide-y divide-slate-200'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                    Producto
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                    Proveedor
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                    Total
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>
                    Pago
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {purchases.map(purchase => (
                  <tr key={purchase.id}>
                    <td className='px-3 py-2 text-sm text-slate-800'>
                      {purchase.product.productName}
                      <span className='ml-1 text-xs text-slate-500'>{purchase.product.sku}</span>
                    </td>
                    <td className='px-3 py-2 text-sm text-slate-700'>{purchase.supplier.name}</td>
                    <td className='px-3 py-2 text-sm tabular-nums'>
                      {formatMxnCurrency(purchase.totalAmount)}
                    </td>
                    <td className='px-3 py-2 text-xs uppercase text-slate-600'>
                      {purchase.paymentStatus === 'paid' ? 'Contado' : 'Crédito'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!purchases.length ? (
              <p className='px-3 py-4 text-sm text-slate-500'>
                {loading ? 'Cargando…' : 'Sin compras registradas.'}
              </p>
            ) : null}
          </div>
        </article>
      </section>

      <section className='mt-6 border border-slate-200 bg-white p-4'>
        <h2 className='text-sm font-semibold text-slate-900'>Alertas de restock</h2>
        <p className='mt-0.5 text-xs text-slate-500'>Stock bajo — atajo a registrar entrada</p>
        <div className='mt-3 overflow-x-auto'>
          <table className='min-w-full divide-y divide-slate-200'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Producto</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Stock</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Faltante</th>
                <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Acción</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {restockItems.map(item => (
                <tr key={item.id}>
                  <td className='px-3 py-2 text-sm text-slate-800'>
                    {item.productName}
                    <span className='ml-1 text-xs text-slate-500'>{item.sku}</span>
                  </td>
                  <td className='px-3 py-2 text-sm tabular-nums'>
                    {formatStockQuantityLabel(item.stock, item.supportsWeight)}
                  </td>
                  <td className='px-3 py-2 text-sm tabular-nums'>
                    {item.supportsWeight
                      ? `${gramsToKilograms(item.deficit).toFixed(3)} kg`
                      : `${item.deficit} pz`}
                  </td>
                  <td className='px-3 py-2'>
                    <button
                      type='button'
                      aria-label={`Registrar entrada de ${item.productName}`}
                      onClick={() => handleQuickRestock(item)}
                      className='rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50'
                    >
                      Entrada
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!restockItems.length ? (
            <p className='px-3 py-4 text-sm text-slate-500'>
              {loading ? 'Cargando…' : 'Sin alertas de stock bajo.'}
            </p>
          ) : null}
        </div>
      </section>

      {message ? (
        <p aria-live='polite' className='mt-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'>
          {message}
        </p>
      ) : null}
      {error ? (
        <p aria-live='assertive' className='mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
