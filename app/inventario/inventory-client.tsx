'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { formatMxnCurrency } from '@/src/lib/mxn-currency'
import type { CrmRole } from '@/src/lib/security/rbac'

type InventoryItem = {
  id: string
  sku: string
  productName: string
  category: string
  stock: number
  unitPrice: number
  aisle: string | null
  supportsWeight: boolean
}

type InventoryResponse = {
  success: boolean
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  items: InventoryItem[]
}

type ImportResponse = {
  success?: boolean
  validateOnly?: boolean
  canImport?: boolean
  summary?: {
    created: number
    updated: number
    failed: number
  }
  preview?: {
    rows: Array<{
      sku: string
      productName: string
      category: string
      stock: number
      unitPrice: number
      aisle: string | null
    }>
    shownRows: number
    totalValidRows: number
    limit: number
  }
  errors?: Array<{ line: number; reason: string }>
  message?: string
}

type InventoryClientProps = {
  role: CrmRole
}

type MovementCategory = 'sales' | 'inventory'

type MovementOperationType = 'sale.create' | 'inventory.import.csv'

type MovementItem = {
  id: string
  category: MovementCategory
  operationType: MovementOperationType
  operationLabel: string
  status: string
  actorUsername: string
  actorRole: string
  createdAt: string
  details: string
}

type MovementsResponse = {
  success: boolean
  filters: {
    limit: number
    operationType: MovementOperationType | 'all'
    category: MovementCategory | 'all'
  }
  operationTypes: MovementOperationType[]
  grouped: {
    sales: MovementItem[]
    inventory: MovementItem[]
  }
  items: MovementItem[]
}

export const InventoryClient = ({ role }: InventoryClientProps) => {
  const searchParams = useSearchParams()
  const shortcut = searchParams.get('shortcut')
  const shouldOpenMovementsByShortcut = shortcut === 'movimientos'
  const [items, setItems] = useState<InventoryItem[]>([])
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'productName' | 'sku' | 'stock' | 'unitPrice'>('productName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshSeed, setRefreshSeed] = useState(0)
  const [activePanel, setActivePanel] = useState<'inventory' | 'movements'>(shouldOpenMovementsByShortcut ? 'movements' : 'inventory')
  const [movements, setMovements] = useState<MovementsResponse['grouped'] | null>(null)
  const [movementOperationTypeFilter, setMovementOperationTypeFilter] = useState<MovementOperationType | 'all'>('all')
  const [movementCategoryFilter, setMovementCategoryFilter] = useState<MovementCategory | 'all'>('all')
  const [availableMovementOperationTypes, setAvailableMovementOperationTypes] = useState<MovementOperationType[]>([])
  const [loadingMovements, setLoadingMovements] = useState(false)

  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [validatingImport, setValidatingImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [validationResult, setValidationResult] = useState<ImportResponse | null>(null)
  const [importResult, setImportResult] = useState<ImportResponse | null>(null)
  const [lastValidatedCsv, setLastValidatedCsv] = useState('')
  const closeModalButtonRef = useRef<HTMLButtonElement | null>(null)

  const canValidateImport = useMemo(
    () => importCsv.trim().length > 0 && !importing && !validatingImport,
    [importCsv, importing, validatingImport]
  )
  const hasFreshValidation = useMemo(
    () => Boolean(validationResult?.validateOnly && lastValidatedCsv === importCsv),
    [importCsv, lastValidatedCsv, validationResult]
  )
  const canSubmitImport = useMemo(
    () => Boolean(hasFreshValidation && validationResult?.canImport && !importing),
    [hasFreshValidation, importing, validationResult]
  )

  useEffect(() => {
    let cancelled = false

    const loadInventory = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          q: query,
          sortBy,
          sortDirection,
          page: String(page),
          pageSize: '30'
        })
        const response = await fetch(`/api/pos/inventory?${params.toString()}`)
        const payload = (await response.json()) as InventoryResponse
        if (!response.ok || !payload.success) {
          throw new Error('No fue posible cargar inventario')
        }
        if (cancelled) return
        setItems(payload.items)
        setTotalPages(payload.pagination.totalPages)
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Error de carga')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInventory()

    return () => {
      cancelled = true
    }
  }, [query, sortBy, sortDirection, page, refreshSeed])

  useEffect(() => {
    if (activePanel !== 'movements') return

    let cancelled = false
    const loadMovements = async () => {
      setLoadingMovements(true)
      try {
        const params = new URLSearchParams({
          operationType: movementOperationTypeFilter,
          category: movementCategoryFilter,
          limit: '120'
        })
        const response = await fetch(`/api/inventario/movimientos?${params.toString()}`)
        const payload = (await response.json()) as MovementsResponse
        if (!response.ok || !payload.success) {
          throw new Error('No fue posible cargar movimientos')
        }
        if (cancelled) return
        setMovements(payload.grouped)
        setAvailableMovementOperationTypes(payload.operationTypes)
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Error de carga de movimientos')
        }
      } finally {
        if (!cancelled) {
          setLoadingMovements(false)
        }
      }
    }

    void loadMovements()

    return () => {
      cancelled = true
    }
  }, [activePanel, movementOperationTypeFilter, movementCategoryFilter, refreshSeed])

  const movementSections = useMemo(() => {
    const grouped = movements || { sales: [], inventory: [] }
    return [
      {
        key: 'sales',
        title: 'Ventas',
        description: 'Operaciones de cobro y emisión de ticket',
        items: grouped.sales
      },
      {
        key: 'inventory',
        title: 'Manejo de inventario',
        description: 'Operaciones administrativas de inventario',
        items: grouped.inventory
      }
    ] as const
  }, [movements])

  const formatOperationType = (operationType: MovementOperationType) => {
    if (operationType === 'sale.create') return 'Venta registrada'
    if (operationType === 'inventory.import.csv') return 'Importación de inventario'
    return operationType
  }

  useEffect(() => {
    if (!isImportModalOpen) return

    closeModalButtonRef.current?.focus()

    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsImportModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscClose)
    return () => {
      window.removeEventListener('keydown', handleEscClose)
    }
  }, [isImportModalOpen])

  const handleOpenImportModal = () => {
    if (role !== 'admin') return
    setIsImportModalOpen(true)
    setValidationResult(null)
    setImportResult(null)
    setLastValidatedCsv('')
  }

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false)
  }

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const fileText = await file.text()
    setImportCsv(fileText)
    setValidationResult(null)
    setImportResult(null)
    setLastValidatedCsv('')
  }

  const handleValidateImport = async () => {
    if (!canValidateImport) return

    setValidatingImport(true)
    setImportResult(null)
    try {
      const response = await fetch('/api/inventario/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importCsv, validateOnly: true })
      })
      const payload = (await response.json()) as ImportResponse
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible validar el CSV')
      }
      setValidationResult(payload)
      setLastValidatedCsv(importCsv)
    } catch (error) {
      setValidationResult({
        success: false,
        validateOnly: true,
        canImport: false,
        message: error instanceof Error ? error.message : 'Error desconocido durante validación',
        errors: []
      })
      setLastValidatedCsv('')
    } finally {
      setValidatingImport(false)
    }
  }

  const handleImport = async () => {
    if (!canSubmitImport) return

    setImporting(true)
    setImportResult(null)
    try {
      const response = await fetch('/api/inventario/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importCsv })
      })
      const payload = (await response.json()) as ImportResponse
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible importar productos')
      }

      setImportResult(payload)
      setRefreshSeed(current => current + 1)
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido durante importación'
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-2xl font-semibold text-slate-950'>Inventario operativo</h1>
        <p className='mt-2 text-sm text-slate-600'>
          Búsqueda por SKU/nombre, ordenamiento y paginación para control diario de productos.
        </p>
      </section>

      <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
        <div className='mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'>
          <div className='inline-flex rounded-lg border border-slate-300 bg-white p-1'>
            <button
              type='button'
              onClick={() => setActivePanel('inventory')}
              aria-label='Ver vista de inventario'
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activePanel === 'inventory' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Inventario
            </button>
            <button
              type='button'
              onClick={() => setActivePanel('movements')}
              aria-label='Ver vista de movimientos'
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activePanel === 'movements' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Movimientos
            </button>
          </div>
          {activePanel === 'inventory' && role === 'admin' ? (
            <button
              type='button'
              onClick={handleOpenImportModal}
              aria-label='Abrir importación de productos'
              className='rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700'
            >
              Importación de productos
            </button>
          ) : null}
        </div>

        {activePanel === 'inventory' ? (
          <>
            <div className='grid gap-3 md:grid-cols-4'>
              <input
                value={query}
                onChange={event => {
                  setPage(1)
                  setQuery(event.target.value)
                }}
                placeholder='Buscar SKU o producto'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm md:col-span-2'
              />
              <select
                value={sortBy}
                onChange={event => setSortBy(event.target.value as 'productName' | 'sku' | 'stock' | 'unitPrice')}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                <option value='productName'>Nombre</option>
                <option value='sku'>SKU</option>
                <option value='stock'>Stock</option>
                <option value='unitPrice'>Precio</option>
              </select>
              <select
                value={sortDirection}
                onChange={event => setSortDirection(event.target.value as 'asc' | 'desc')}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                <option value='asc'>Ascendente</option>
                <option value='desc'>Descendente</option>
              </select>
            </div>

            <div className='mt-4 overflow-x-auto rounded-xl border border-slate-200'>
              <table className='min-w-full divide-y divide-slate-200'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>SKU</th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Producto</th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Stock</th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Precio</th>
                    <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Tipo</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100 bg-white'>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td className='px-3 py-2 text-sm text-slate-700'>{item.sku}</td>
                      <td className='px-3 py-2 text-sm text-slate-900'>
                        <p className='font-medium'>{item.productName}</p>
                        <p className='text-xs text-slate-500'>{item.category}</p>
                      </td>
                      <td className='px-3 py-2 text-sm text-slate-700'>
                        {item.supportsWeight ? `${(item.stock / 1000).toFixed(3)} kg` : `${item.stock} und`}
                      </td>
                      <td className='px-3 py-2 text-sm text-slate-700'>{formatMxnCurrency(item.unitPrice)}</td>
                      <td className='px-3 py-2 text-sm text-slate-700'>{item.supportsWeight ? 'Peso' : 'Pieza'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!items.length ? <p className='px-3 py-4 text-sm text-slate-500'>Sin productos para los filtros seleccionados.</p> : null}
            </div>

            <div className='mt-4 flex items-center justify-between text-sm text-slate-600'>
              <button
                type='button'
                disabled={page <= 1 || loading}
                onClick={() => setPage(current => Math.max(1, current - 1))}
                className='rounded-lg border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50'
              >
                Anterior
              </button>
              <p>
                Página {page} de {totalPages}
              </p>
              <button
                type='button'
                disabled={page >= totalPages || loading}
                onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                className='rounded-lg border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50'
              >
                Siguiente
              </button>
            </div>
          </>
        ) : (
          <section className='space-y-4'>
            <div className='grid gap-3 md:grid-cols-3'>
              <select
                value={movementOperationTypeFilter}
                onChange={event => setMovementOperationTypeFilter(event.target.value as MovementOperationType | 'all')}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                <option value='all'>Todos los tipos</option>
                {availableMovementOperationTypes.map(operationType => (
                  <option key={operationType} value={operationType}>
                    {formatOperationType(operationType)}
                  </option>
                ))}
              </select>
              <select
                value={movementCategoryFilter}
                onChange={event => setMovementCategoryFilter(event.target.value as MovementCategory | 'all')}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                <option value='all'>Todas las categorías</option>
                <option value='sales'>Ventas</option>
                <option value='inventory'>Manejo de inventario</option>
              </select>
              <button
                type='button'
                onClick={() => setRefreshSeed(current => current + 1)}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'
              >
                Actualizar movimientos
              </button>
            </div>

            {loadingMovements ? <p className='text-sm text-slate-500'>Cargando movimientos...</p> : null}

            {movementSections.map(section => (
              <article key={section.key} className='rounded-xl border border-slate-200'>
                <header className='border-b border-slate-200 bg-slate-50 px-4 py-3'>
                  <h2 className='text-sm font-semibold text-slate-900'>{section.title}</h2>
                  <p className='mt-1 text-xs text-slate-600'>{section.description}</p>
                </header>
                <div className='overflow-x-auto'>
                  <table className='min-w-full divide-y divide-slate-200'>
                    <thead className='bg-white'>
                      <tr>
                        <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Fecha</th>
                        <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Operación</th>
                        <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Detalle</th>
                        <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Usuario</th>
                        <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Estado</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-100 bg-white'>
                      {section.items.map(item => (
                        <tr key={item.id}>
                          <td className='whitespace-nowrap px-3 py-2 text-sm text-slate-700'>
                            {new Date(item.createdAt).toLocaleString('es-MX')}
                          </td>
                          <td className='px-3 py-2 text-sm text-slate-800'>{item.operationLabel}</td>
                          <td className='px-3 py-2 text-sm text-slate-700'>{item.details}</td>
                          <td className='px-3 py-2 text-sm text-slate-700'>
                            {item.actorUsername} <span className='text-xs text-slate-500'>({item.actorRole})</span>
                          </td>
                          <td className='px-3 py-2 text-sm text-slate-700'>{item.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!section.items.length ? (
                    <p className='px-3 py-4 text-sm text-slate-500'>Sin movimientos para los filtros seleccionados.</p>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        )}
      </section>

      {message ? (
        <p aria-live='polite' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {message}
        </p>
      ) : null}

      {isImportModalOpen ? (
        <div
          className='fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4'
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              handleCloseImportModal()
            }
          }}
        >
          <section
            role='dialog'
            aria-modal='true'
            aria-labelledby='inventory-import-title'
            className='w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl'
          >
            <div className='flex items-start justify-between gap-4 border-b border-slate-200 pb-4'>
              <div>
                <h2 id='inventory-import-title' className='text-lg font-semibold text-slate-950'>
                  Importación de productos
                </h2>
                <p className='mt-1 text-sm text-slate-600'>
                  Selecciona un archivo CSV con columnas sku, productName, category, stock y unitPrice.
                </p>
              </div>
              <button
                ref={closeModalButtonRef}
                type='button'
                onClick={handleCloseImportModal}
                aria-label='Cerrar modal de importación'
                className='rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100'
              >
                Cerrar
              </button>
            </div>

            <div className='mt-4 grid gap-4'>
              <label className='grid gap-2 text-sm font-medium text-slate-700'>
                Archivo CSV
                <input
                  type='file'
                  accept='.csv,text/csv'
                  onChange={event => void handleImportFileChange(event)}
                  aria-label='Seleccionar archivo CSV de productos'
                  className='rounded-lg border border-slate-300 px-3 py-2 text-sm'
                />
              </label>

              <label className='grid gap-2 text-sm font-medium text-slate-700'>
                Contenido CSV
                <textarea
                  value={importCsv}
                  onChange={event => {
                    setImportCsv(event.target.value)
                    setValidationResult(null)
                    setImportResult(null)
                    setLastValidatedCsv('')
                  }}
                  rows={12}
                  className='rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900'
                />
              </label>

              <div className='flex items-center gap-3'>
                <button
                  type='button'
                  aria-label='Validar y previsualizar importación'
                  onClick={() => void handleValidateImport()}
                  disabled={!canValidateImport}
                  className='rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  {validatingImport ? 'Validando...' : 'Validar / Previsualizar'}
                </button>
                <button
                  type='button'
                  aria-label='Ejecutar importación de productos'
                  onClick={() => void handleImport()}
                  disabled={!canSubmitImport}
                  className='rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
                >
                  {importing ? 'Importando...' : 'Importar productos'}
                </button>
                <button
                  type='button'
                  onClick={handleCloseImportModal}
                  className='rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100'
                >
                  Cancelar
                </button>
              </div>
              {!hasFreshValidation ? (
                <p className='text-xs text-slate-500'>
                  Debes validar y previsualizar el CSV antes de ejecutar la importación.
                </p>
              ) : null}
            </div>

            {validationResult?.validateOnly ? (
              <section className='mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4'>
                <h3 className='text-sm font-semibold text-slate-900'>Previsualización</h3>
                <p className={`mt-1 text-sm ${validationResult.canImport ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {validationResult.message
                    ? validationResult.message
                    : validationResult.canImport
                      ? 'Validación completa. Puedes continuar con la importación.'
                      : 'La validación encontró errores que bloquean la importación.'}
                </p>
                {validationResult.preview ? (
                  <p className='mt-2 text-xs text-slate-600'>
                    Filas válidas: {validationResult.preview.totalValidRows}. Mostrando {validationResult.preview.shownRows} de{' '}
                    {validationResult.preview.limit}.
                  </p>
                ) : null}
                {validationResult.preview?.rows.length ? (
                  <div className='mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white'>
                    <table className='min-w-full divide-y divide-slate-200'>
                      <thead className='bg-slate-50'>
                        <tr>
                          <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>SKU</th>
                          <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                            Producto
                          </th>
                          <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                            Categoría
                          </th>
                          <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Stock</th>
                          <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                            Precio
                          </th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-slate-100 bg-white'>
                        {validationResult.preview.rows.map(row => (
                          <tr key={`${row.sku}-${row.productName}`}>
                            <td className='px-3 py-2 text-xs text-slate-700'>{row.sku}</td>
                            <td className='px-3 py-2 text-xs text-slate-900'>{row.productName}</td>
                            <td className='px-3 py-2 text-xs text-slate-700'>{row.category}</td>
                            <td className='px-3 py-2 text-xs text-slate-700'>{row.stock}</td>
                            <td className='px-3 py-2 text-xs text-slate-700'>{formatMxnCurrency(row.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {validationResult.errors?.length ? (
                  <ul className='mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700'>
                    {validationResult.errors.slice(0, 20).map(error => (
                      <li key={`${error.line}-${error.reason}`}>Línea {error.line}: {error.reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p className='mt-3 text-sm text-slate-700'>Sin errores de validación.</p>
                )}
              </section>
            ) : null}

            {importResult ? (
              <section className='mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4'>
                {importResult.success && importResult.summary ? (
                  <>
                    <h3 className='text-sm font-semibold text-slate-900'>Resultado de importación</h3>
                    <p className='mt-1 text-sm text-slate-700'>
                      Creados: {importResult.summary.created} | Actualizados: {importResult.summary.updated} | Fallidos:{' '}
                      {importResult.summary.failed}
                    </p>
                    {importResult.errors?.length ? (
                      <ul className='mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700'>
                        {importResult.errors.slice(0, 20).map(error => (
                          <li key={`${error.line}-${error.reason}`}>Línea {error.line}: {error.reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <p className='text-sm text-rose-700'>{importResult.message || 'Error en importación'}</p>
                )}
              </section>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  )
}
