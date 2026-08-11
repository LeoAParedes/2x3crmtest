'use client'

import { useCallback, useEffect, useState } from 'react'

import { PROMO_TYPES, type PromoType } from '@/src/lib/finance/promotions-schema'

type PromotionProduct = {
  inventoryItemId: string
  sku: string
  productName: string
}

type PromotionBundleItem = {
  inventoryItemId: string
  requiredQty: number
  sku: string
  productName: string
}

type Promotion = {
  id: string
  name: string
  type: PromoType
  value: number
  minPurchase: number
  description: string
  active: boolean
  startsAt: string | null
  expiresAt: string | null
  createdByUsername: string
  createdAt: string
  productIds: string[]
  products: PromotionProduct[]
  bundleItems: PromotionBundleItem[]
}

type SelectedProduct = {
  inventoryItemId: string
  sku: string
  productName: string
  requiredQty: number
}

type InventoryItem = {
  id: string
  sku: string
  productName: string
}

const promoTypeLabels: Record<PromoType, string> = {
  porcentaje: 'Porcentaje (%)',
  monto_fijo: 'Monto fijo ($)',
  '2x1': '2 × 1',
  '3x2': '3 × 2',
  bundle: 'Paquete / bundle'
}

const productSelectionTypes: PromoType[] = ['porcentaje', 'monto_fijo', '2x1', '3x2', 'bundle']

const formatPromoValue = (promo: Promotion) => {
  if (promo.type === 'porcentaje') return `${promo.value}%`
  if (promo.type === '2x1' || promo.type === '3x2') return promoTypeLabels[promo.type]
  return `$${promo.value}`
}

const formatProductSummary = (promo: Promotion) => {
  if (promo.type === 'bundle') {
    const items = promo.bundleItems || []
    if (!items.length) return 'Sin productos'
    return items
      .map(item => `${item.productName || item.sku || item.inventoryItemId} ×${item.requiredQty}`)
      .join(', ')
  }

  const products = promo.products || []
  if (!products.length) {
    const count = promo.productIds?.length ?? 0
    return count > 0 ? `${count} producto(s)` : 'Sin restricción'
  }
  return `${products.length} producto(s)`
}

const formatSelectionSummary = (type: PromoType, items: SelectedProduct[]) => {
  if (!items.length) {
    if (type === 'bundle' || type === '2x1' || type === '3x2') return 'Sin productos seleccionados'
    return 'Sin restricción de productos'
  }
  if (type === 'bundle') {
    return items.map(item => `${item.productName} ×${item.requiredQty}`).join(', ')
  }
  return `${items.length} producto(s) seleccionado(s)`
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
  const [startsAt, setStartsAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([])
  const [showProductModal, setShowProductModal] = useState(false)
  const [modalSelection, setModalSelection] = useState<SelectedProduct[]>([])
  const [inventoryQuery, setInventoryQuery] = useState('')
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState<string | null>(null)

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

  const loadInventory = useCallback(async (query: string) => {
    setInventoryLoading(true)
    setInventoryError(null)
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '50'
      })
      if (query.trim()) params.set('q', query.trim())
      const response = await fetch(`/api/pos/inventory?${params.toString()}`)
      const payload = (await response.json()) as {
        success?: boolean
        items?: InventoryItem[]
        message?: string
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible cargar inventario')
      }
      setInventoryItems(payload.items || [])
    } catch (loadInventoryError) {
      setInventoryError(
        loadInventoryError instanceof Error ? loadInventoryError.message : 'Error al cargar inventario'
      )
      setInventoryItems([])
    } finally {
      setInventoryLoading(false)
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

  useEffect(() => {
    if (!showProductModal) return
    const timeoutId = window.setTimeout(() => {
      void loadInventory(inventoryQuery)
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [showProductModal, inventoryQuery, loadInventory])

  const resetForm = () => {
    setName('')
    setPromoType('porcentaje')
    setValue('')
    setMinPurchase('0')
    setDescription('')
    setActive(true)
    setStartsAt('')
    setExpiresAt('')
    setSelectedProducts([])
    setShowProductModal(false)
    setModalSelection([])
    setInventoryQuery('')
    setInventoryItems([])
    setInventoryError(null)
  }

  const handleOpenProductModal = () => {
    setModalSelection(selectedProducts.map(item => ({ ...item })))
    setInventoryQuery('')
    setShowProductModal(true)
  }

  const handleCloseProductModal = () => {
    setShowProductModal(false)
    setModalSelection([])
    setInventoryQuery('')
    setInventoryError(null)
  }

  const handleConfirmProductModal = () => {
    setSelectedProducts(modalSelection.map(item => ({ ...item })))
    setShowProductModal(false)
    setModalSelection([])
    setInventoryQuery('')
    setInventoryError(null)
  }

  const handleToggleInventoryItem = (item: InventoryItem) => {
    const existing = modalSelection.find(entry => entry.inventoryItemId === item.id)
    if (existing) {
      setModalSelection(current => current.filter(entry => entry.inventoryItemId !== item.id))
      return
    }
    setModalSelection(current => [
      ...current,
      {
        inventoryItemId: item.id,
        sku: item.sku,
        productName: item.productName,
        requiredQty: 1
      }
    ])
  }

  const handleModalRequiredQtyChange = (inventoryItemId: string, rawValue: string) => {
    const parsed = Number(rawValue)
    const requiredQty = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
    setModalSelection(current =>
      current.map(entry =>
        entry.inventoryItemId === inventoryItemId ? { ...entry, requiredQty } : entry
      )
    )
  }

  const validateProductSelection = () => {
    if (promoType === 'bundle') {
      if (selectedProducts.length < 2) {
        return 'Un paquete requiere al menos 2 productos'
      }
      const invalidQty = selectedProducts.some(item => !Number.isFinite(item.requiredQty) || item.requiredQty <= 0)
      if (invalidQty) return 'Cada producto del paquete debe tener cantidad mayor a 0'
      return null
    }
    if (promoType === '2x1' || promoType === '3x2') {
      if (selectedProducts.length < 1) return 'Selecciona al menos un producto para esta promoción'
    }
    return null
  }

  // Description is intentionally NOT part of this gate — it is optional.
  const canAttemptSave = name.trim().length >= 2 && value.trim().length > 0 && !saving

  const handleCreatePromotion = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    setMessage(null)

    const trimmedName = name.trim()
    // Optional: blank description defaults to the promotion name (DB requires non-null String).
    const resolvedDescription = description.trim() || trimmedName
    const parsedValue = Number(value.replace(',', '.'))
    const parsedMinPurchase = Number(minPurchase.replace(',', '.'))

    if (!trimmedName || trimmedName.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres')
      setSaving(false)
      return
    }
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      setError('Indica un valor válido')
      setSaving(false)
      return
    }
    if (promoType === 'bundle' && parsedValue <= 0) {
      setError('Un paquete requiere un descuento fijo mayor a 0')
      setSaving(false)
      return
    }
    if (startsAt && expiresAt && startsAt > expiresAt) {
      setError('La fecha de inicio no puede ser posterior a la de expiración')
      setSaving(false)
      return
    }

    const productSelectionError = validateProductSelection()
    if (productSelectionError) {
      setError(productSelectionError)
      setSaving(false)
      return
    }

    const productIds =
      promoType === 'bundle' ? [] : selectedProducts.map(item => item.inventoryItemId)
    const bundleItems =
      promoType === 'bundle'
        ? selectedProducts.map(item => ({
            inventoryItemId: item.inventoryItemId,
            requiredQty: item.requiredQty
          }))
        : []

    try {
      const response = await fetch('/api/finanzas/promociones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          type: promoType,
          value: parsedValue,
          minPurchase: Number.isFinite(parsedMinPurchase) ? parsedMinPurchase : 0,
          description: resolvedDescription,
          active,
          startsAt: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : null,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
          productIds,
          bundleItems
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
  const showProductPicker = productSelectionTypes.includes(promoType)

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
              Descripción (opcional)
              <input
                type='text'
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder='Si se omite, se usa el nombre de la promoción'
                aria-label='Descripción de la promoción (opcional)'
                aria-required='false'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Inicia
              <input
                type='date'
                value={startsAt}
                onChange={event => setStartsAt(event.target.value)}
                aria-label='Fecha de inicio'
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
            {showProductPicker ? (
              <div className='grid gap-2 sm:col-span-2'>
                <span className='text-sm text-slate-700'>Productos</span>
                <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
                  <p className='text-sm text-slate-600' aria-live='polite'>
                    {formatSelectionSummary(promoType, selectedProducts)}
                  </p>
                  <button
                    type='button'
                    onClick={handleOpenProductModal}
                    aria-label='Seleccionar productos para la promoción'
                    className='h-10 shrink-0 rounded-lg border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50'
                  >
                    Seleccionar productos
                  </button>
                </div>
              </div>
            ) : null}
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
          <div className='mt-4 flex flex-col gap-2'>
            {!canAttemptSave && !saving ? (
              <p className='text-sm text-amber-700' role='status'>
                Completa el nombre (mín. 2 caracteres) y el valor para guardar.
              </p>
            ) : null}
            <div className='flex gap-3'>
            <button
              type='button'
              disabled={!canAttemptSave}
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
          </div>
          {error ? (
            <p role='alert' className='mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {showProductModal ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4'
          onMouseDown={event => {
            if (event.target === event.currentTarget) handleCloseProductModal()
          }}
        >
          <section
            role='dialog'
            aria-modal='true'
            aria-labelledby='product-picker-title'
            className='flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl'
          >
            <div className='flex items-start justify-between gap-3 border-b border-slate-200 pb-3'>
              <div>
                <h2 id='product-picker-title' className='text-lg font-semibold text-slate-900'>
                  Seleccionar productos
                </h2>
                <p className='mt-1 text-sm text-slate-600'>
                  {promoType === 'bundle'
                    ? 'Selecciona al menos 2 productos y define la cantidad requerida de cada uno.'
                    : 'Busca y selecciona los productos aplicables a esta promoción.'}
                </p>
              </div>
              <button
                type='button'
                onClick={handleCloseProductModal}
                aria-label='Cerrar selector de productos'
                className='rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100'
              >
                Cerrar
              </button>
            </div>

            <div className='mt-4 flex gap-2'>
              <input
                type='search'
                value={inventoryQuery}
                onChange={event => setInventoryQuery(event.target.value)}
                placeholder='Buscar por nombre o SKU…'
                aria-label='Buscar productos en inventario'
                className='h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </div>

            {inventoryError ? (
              <p role='alert' className='mt-3 text-sm text-rose-700'>{inventoryError}</p>
            ) : null}

            <div className='mt-4 flex-1 overflow-y-auto rounded-lg border border-slate-200'>
              {inventoryLoading ? (
                <p className='px-4 py-3 text-sm text-slate-500'>Cargando inventario…</p>
              ) : null}
              {!inventoryLoading && !inventoryItems.length ? (
                <p className='px-4 py-3 text-sm text-slate-500'>No se encontraron productos.</p>
              ) : null}
              {!inventoryLoading && inventoryItems.length > 0 ? (
                <ul className='divide-y divide-slate-100'>
                  {inventoryItems.map(item => {
                    const selected = modalSelection.find(entry => entry.inventoryItemId === item.id)
                    const isChecked = Boolean(selected)
                    return (
                      <li key={item.id} className='flex items-center gap-3 px-3 py-2'>
                        <input
                          type='checkbox'
                          checked={isChecked}
                          onChange={() => handleToggleInventoryItem(item)}
                          aria-label={`Seleccionar ${item.productName}`}
                          className='h-4 w-4 rounded border-slate-300'
                        />
                        <div className='min-w-0 flex-1'>
                          <p className='truncate text-sm font-medium text-slate-900'>{item.productName}</p>
                          <p className='text-xs text-slate-500'>SKU: {item.sku}</p>
                        </div>
                        {promoType === 'bundle' && isChecked ? (
                          <label className='flex items-center gap-1 text-xs text-slate-600'>
                            Cant.
                            <input
                              type='number'
                              min='1'
                              step='1'
                              value={selected?.requiredQty ?? 1}
                              onChange={event => handleModalRequiredQtyChange(item.id, event.target.value)}
                              aria-label={`Cantidad requerida de ${item.productName}`}
                              className='h-8 w-16 rounded border border-slate-300 px-2 text-sm'
                            />
                          </label>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>

            <div className='mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3'>
              <p className='text-sm text-slate-600' aria-live='polite'>
                {modalSelection.length} seleccionado(s)
              </p>
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={handleCloseProductModal}
                  aria-label='Cancelar selección de productos'
                  className='rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100'
                >
                  Cancelar
                </button>
                <button
                  type='button'
                  onClick={handleConfirmProductModal}
                  aria-label='Confirmar selección de productos'
                  className='rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700'
                >
                  Confirmar
                </button>
              </div>
            </div>
          </section>
        </div>
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
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Productos</th>
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
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>{formatPromoValue(promo)}</td>
                <td className='max-w-xs px-3 py-2 text-sm text-slate-600' title={formatProductSummary(promo)}>
                  {formatProductSummary(promo)}
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
      {!showForm && error ? (
        <p role='alert' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
