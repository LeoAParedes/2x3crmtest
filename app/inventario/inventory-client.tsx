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

type LogbookCategory = 'sales' | 'inventory' | 'pos' | 'crm' | 'system'

type LogbookItem = {
  id: string
  category: LogbookCategory
  action: string
  actionLabel: string
  status: string
  actorUsername: string
  actorRole: string
  createdAt: string
  details: string
}

type LogbookResponse = {
  success: boolean
  filters: {
    limit: number
    action?: string
    status: 'all' | 'success' | 'failed' | 'pending'
    category: LogbookCategory | 'all'
    actor?: string
  }
  actions: string[]
  categories: LogbookCategory[]
  items: LogbookItem[]
}

type AdjustmentPayload =
  | {
      operation: 'add_product'
      sku: string
      productName: string
      category: string
      stock: number
      unitPrice: number
      aisle: string | null
    }
  | {
      operation: 'delete_product'
      inventoryItemId: string
      reason: string
    }
  | {
      operation: 'correct_price'
      inventoryItemId: string
      newUnitPrice: number
      reason: string
    }
  | {
      operation: 'schedule_price'
      inventoryItemId: string
      newUnitPrice: number
      effectiveFrom: string
      reason: string
    }
  | {
      operation: 'stock_entry'
      inventoryItemId: string
      quantity: number
      unitCost: number
      reason: string
    }
  | {
      operation: 'stock_exit'
      inventoryItemId: string
      quantity: number
      valuationMethod: 'fifo' | 'average'
      reason: string
    }

type InventoryAdjustmentsResponse = {
  success: boolean
  message?: string
  item?: {
    id: string
    sku: string
    productName: string
    category?: string
    stock: number
    unitPrice: number
  }
  valuation?: {
    unitCost: number
    totalCost: number
  }
  schedules?: Array<{
    id: string
    inventoryItemId: string
    status: string
    metadata: unknown
    createdAt: string
  }>
  movements?: Array<{
    id: string
    inventoryItemId: string
    sku: string
    productName: string
    movementType: string
    quantity: number
    reason: string | null
    createdAt: string
  }>
}

type RowAdjustmentOperation = 'correct_price' | 'schedule_price' | 'stock_entry' | 'stock_exit' | 'delete_product'

type RowAdjustmentDraft = {
  operation: RowAdjustmentOperation
  reason: string
  newUnitPrice: string
  effectiveFrom: string
  quantity: string
  unitCost: string
  valuationMethod: 'fifo' | 'average'
}

type BulkOperation = 'correct_price' | 'schedule_price' | 'stock_entry' | 'stock_exit' | 'delete_product'

const createDefaultRowDraft = (): RowAdjustmentDraft => ({
  operation: 'correct_price',
  reason: 'Ajuste manual de inventario',
  newUnitPrice: '',
  effectiveFrom: '',
  quantity: '',
  unitCost: '',
  valuationMethod: 'fifo'
})

export const InventoryClient = ({ role }: InventoryClientProps) => {
  const searchParams = useSearchParams()
  const shortcut = searchParams.get('shortcut')
  const shouldOpenLogbookByShortcut = shortcut === 'movimientos' || shortcut === 'bitacora'
  const shouldOpenAdjustmentsByShortcut = shortcut === 'ajuste'
  const [items, setItems] = useState<InventoryItem[]>([])
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'productName' | 'sku' | 'stock' | 'unitPrice'>('productName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshSeed, setRefreshSeed] = useState(0)
  const [activePanel, setActivePanel] = useState<'inventory' | 'logbook' | 'adjustments'>(
    shouldOpenAdjustmentsByShortcut ? 'adjustments' : shouldOpenLogbookByShortcut ? 'logbook' : 'inventory'
  )
  const [logbookItems, setLogbookItems] = useState<LogbookItem[]>([])
  const [logbookActionFilter, setLogbookActionFilter] = useState<string>('all')
  const [logbookStatusFilter, setLogbookStatusFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all')
  const [logbookCategoryFilter, setLogbookCategoryFilter] = useState<LogbookCategory | 'all'>('all')
  const [logbookActorFilter, setLogbookActorFilter] = useState('')
  const [availableLogbookActions, setAvailableLogbookActions] = useState<string[]>([])
  const [loadingLogbook, setLoadingLogbook] = useState(false)
  const [loadingAdjustments, setLoadingAdjustments] = useState(false)
  const [adjustmentsSnapshot, setAdjustmentsSnapshot] = useState<InventoryAdjustmentsResponse | null>(null)
  const [adjustmentResult, setAdjustmentResult] = useState<string | null>(null)
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowAdjustmentDraft>>({})
  const [bulkOperation, setBulkOperation] = useState<BulkOperation>('correct_price')
  const [bulkReason, setBulkReason] = useState('Ajuste masivo de inventario')
  const [bulkNewUnitPrice, setBulkNewUnitPrice] = useState('')
  const [bulkEffectiveFrom, setBulkEffectiveFrom] = useState('')
  const [bulkQuantity, setBulkQuantity] = useState('')
  const [bulkUnitCost, setBulkUnitCost] = useState('')
  const [bulkValuationMethod, setBulkValuationMethod] = useState<'fifo' | 'average'>('fifo')
  const [addProductForm, setAddProductForm] = useState({
    sku: '',
    productName: '',
    category: '',
    stock: '0',
    unitPrice: '0',
    aisle: ''
  })

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
    if (activePanel !== 'logbook') return

    let cancelled = false
    const loadLogbook = async () => {
      setLoadingLogbook(true)
      try {
        const params = new URLSearchParams({
          category: logbookCategoryFilter,
          status: logbookStatusFilter,
          limit: '180'
        })
        if (logbookActionFilter !== 'all') {
          params.set('action', logbookActionFilter)
        }
        if (logbookActorFilter.trim().length > 0) {
          params.set('actor', logbookActorFilter.trim())
        }

        const response = await fetch(`/api/inventario/bitacora?${params.toString()}`)
        const payload = (await response.json()) as LogbookResponse
        if (!response.ok || !payload.success) {
          throw new Error('No fue posible cargar la bitácora')
        }
        if (cancelled) return
        setLogbookItems(payload.items)
        setAvailableLogbookActions(payload.actions)
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Error de carga de bitácora')
        }
      } finally {
        if (!cancelled) {
          setLoadingLogbook(false)
        }
      }
    }

    void loadLogbook()

    return () => {
      cancelled = true
    }
  }, [activePanel, logbookActionFilter, logbookCategoryFilter, logbookStatusFilter, logbookActorFilter, refreshSeed])

  useEffect(() => {
    if (activePanel !== 'adjustments') return

    let cancelled = false
    const loadAdjustments = async () => {
      setLoadingAdjustments(true)
      try {
        const response = await fetch('/api/inventario/ajustes')
        const payload = (await response.json()) as InventoryAdjustmentsResponse
        if (!response.ok || !payload.success) {
          throw new Error('No fue posible cargar estado de ajustes')
        }
        if (cancelled) return
        setAdjustmentsSnapshot(payload)
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Error de carga de ajustes')
        }
      } finally {
        if (!cancelled) {
          setLoadingAdjustments(false)
        }
      }
    }

    void loadAdjustments()

    return () => {
      cancelled = true
    }
  }, [activePanel, refreshSeed])

  const effectiveSelectedItemIds = useMemo(
    () => selectedItemIds.filter(id => items.some(item => item.id === id)),
    [selectedItemIds, items]
  )
  const selectedItemsCount = effectiveSelectedItemIds.length

  const parseNumberInput = (raw: string) => {
    const normalized = Number(raw.replace(',', '.'))
    if (!Number.isFinite(normalized)) return null
    return normalized
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

  const submitAdjustment = async (payload: AdjustmentPayload) => {
    setSubmittingAdjustment(true)
    setAdjustmentResult(null)
    setMessage(null)
    try {
      const response = await fetch('/api/inventario/ajustes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const result = (await response.json()) as InventoryAdjustmentsResponse
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'No fue posible aplicar el ajuste')
      }

      setAdjustmentResult(result.message || 'Ajuste aplicado')
      setRefreshSeed(current => current + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error aplicando ajuste')
    } finally {
      setSubmittingAdjustment(false)
    }
  }

  const handleAddProduct = async () => {
    const stock = parseNumberInput(addProductForm.stock)
    const unitPrice = parseNumberInput(addProductForm.unitPrice)
    if (stock === null || unitPrice === null) {
      setMessage('Stock y precio del producto nuevo deben ser numéricos')
      return
    }

    await submitAdjustment({
      operation: 'add_product',
      sku: addProductForm.sku.trim(),
      productName: addProductForm.productName.trim(),
      category: addProductForm.category.trim(),
      stock: Math.max(0, Math.round(stock)),
      unitPrice: Number(unitPrice.toFixed(2)),
      aisle: addProductForm.aisle.trim() ? addProductForm.aisle.trim() : null
    })
  }

  const handleToggleItemSelection = (itemId: string) => {
    setSelectedItemIds(current =>
      current.includes(itemId) ? current.filter(id => id !== itemId) : [...current, itemId]
    )
  }

  const handleToggleAllSelections = () => {
    if (effectiveSelectedItemIds.length === items.length) {
      setSelectedItemIds([])
      return
    }
    setSelectedItemIds(items.map(item => item.id))
  }

  const updateRowDraft = (itemId: string, patch: Partial<RowAdjustmentDraft>) => {
    setRowDrafts(current => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || createDefaultRowDraft()),
        ...patch
      }
    }))
  }

  const buildRowPayload = (itemId: string, draft: RowAdjustmentDraft): AdjustmentPayload | null => {
    const normalizedReason = draft.reason.trim()
    if (!normalizedReason) {
      throw new Error('Debes indicar un motivo para el ajuste')
    }

    if (draft.operation === 'delete_product') {
      return {
        operation: 'delete_product',
        inventoryItemId: itemId,
        reason: normalizedReason
      }
    }

    if (draft.operation === 'correct_price') {
      const parsedPrice = parseNumberInput(draft.newUnitPrice)
      if (parsedPrice === null) {
        throw new Error('Precio inválido para corrección')
      }
      return {
        operation: 'correct_price',
        inventoryItemId: itemId,
        newUnitPrice: Number(parsedPrice.toFixed(2)),
        reason: normalizedReason
      }
    }

    if (draft.operation === 'schedule_price') {
      const parsedPrice = parseNumberInput(draft.newUnitPrice)
      if (parsedPrice === null) {
        throw new Error('Precio inválido para programación')
      }
      if (!draft.effectiveFrom) {
        throw new Error('Fecha/hora requerida para precio programado')
      }
      return {
        operation: 'schedule_price',
        inventoryItemId: itemId,
        newUnitPrice: Number(parsedPrice.toFixed(2)),
        effectiveFrom: new Date(draft.effectiveFrom).toISOString(),
        reason: normalizedReason
      }
    }

    if (draft.operation === 'stock_entry') {
      const quantity = parseNumberInput(draft.quantity)
      const unitCost = parseNumberInput(draft.unitCost)
      if (quantity === null || unitCost === null) {
        throw new Error('Cantidad/costo inválidos para entrada')
      }
      return {
        operation: 'stock_entry',
        inventoryItemId: itemId,
        quantity: Math.max(1, Math.round(quantity)),
        unitCost: Number(unitCost.toFixed(2)),
        reason: normalizedReason
      }
    }

    const quantity = parseNumberInput(draft.quantity)
    if (quantity === null) {
      throw new Error('Cantidad inválida para salida')
    }
    return {
      operation: 'stock_exit',
      inventoryItemId: itemId,
      quantity: Math.max(1, Math.round(quantity)),
      valuationMethod: draft.valuationMethod,
      reason: normalizedReason
    }
  }

  const handleApplyRowAdjustment = async (itemId: string) => {
    const draft = rowDrafts[itemId] || createDefaultRowDraft()
    try {
      const payload = buildRowPayload(itemId, draft)
      if (!payload) return
      await submitAdjustment(payload)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible aplicar ajuste de fila')
    }
  }

  const buildBulkPayloadForItem = (itemId: string): AdjustmentPayload | null => {
    const normalizedReason = bulkReason.trim()
    if (!normalizedReason) {
      throw new Error('Define un motivo para el ajuste en lote')
    }

    if (bulkOperation === 'delete_product') {
      return {
        operation: 'delete_product',
        inventoryItemId: itemId,
        reason: normalizedReason
      }
    }

    if (bulkOperation === 'correct_price') {
      const parsed = parseNumberInput(bulkNewUnitPrice)
      if (parsed === null) {
        throw new Error('Precio inválido para corrección en lote')
      }
      return {
        operation: 'correct_price',
        inventoryItemId: itemId,
        newUnitPrice: Number(parsed.toFixed(2)),
        reason: normalizedReason
      }
    }

    if (bulkOperation === 'schedule_price') {
      const parsed = parseNumberInput(bulkNewUnitPrice)
      if (parsed === null) {
        throw new Error('Precio inválido para programación en lote')
      }
      if (!bulkEffectiveFrom) {
        throw new Error('Fecha requerida para programación en lote')
      }
      return {
        operation: 'schedule_price',
        inventoryItemId: itemId,
        newUnitPrice: Number(parsed.toFixed(2)),
        effectiveFrom: new Date(bulkEffectiveFrom).toISOString(),
        reason: normalizedReason
      }
    }

    if (bulkOperation === 'stock_entry') {
      const quantity = parseNumberInput(bulkQuantity)
      const unitCost = parseNumberInput(bulkUnitCost)
      if (quantity === null || unitCost === null) {
        throw new Error('Cantidad/costo inválidos para entrada en lote')
      }
      return {
        operation: 'stock_entry',
        inventoryItemId: itemId,
        quantity: Math.max(1, Math.round(quantity)),
        unitCost: Number(unitCost.toFixed(2)),
        reason: normalizedReason
      }
    }

    const quantity = parseNumberInput(bulkQuantity)
    if (quantity === null) {
      throw new Error('Cantidad inválida para salida en lote')
    }
    return {
      operation: 'stock_exit',
      inventoryItemId: itemId,
      quantity: Math.max(1, Math.round(quantity)),
      valuationMethod: bulkValuationMethod,
      reason: normalizedReason
    }
  }

  const handleApplyBulkSameValues = async () => {
    if (!effectiveSelectedItemIds.length) {
      setMessage('Selecciona al menos un producto para ajuste masivo')
      return
    }

    try {
      for (const itemId of effectiveSelectedItemIds) {
        const payload = buildBulkPayloadForItem(itemId)
        if (!payload) continue
        await submitAdjustment(payload)
      }
      setAdjustmentResult(`Ajuste masivo aplicado en ${effectiveSelectedItemIds.length} producto(s)`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible aplicar ajuste masivo')
    }
  }

  const handleApplyBulkRowValues = async () => {
    if (!effectiveSelectedItemIds.length) {
      setMessage('Selecciona productos para aplicar ajustes por fila')
      return
    }

    try {
      for (const itemId of effectiveSelectedItemIds) {
        const draft = rowDrafts[itemId] || createDefaultRowDraft()
        const payload = buildRowPayload(itemId, draft)
        if (!payload) continue
        await submitAdjustment(payload)
      }
      setAdjustmentResult(`Ajustes por fila aplicados en ${effectiveSelectedItemIds.length} producto(s)`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible aplicar ajustes por fila')
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
              onClick={() => setActivePanel('logbook')}
              aria-label='Ver vista de bitácora'
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activePanel === 'logbook' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Bitácora
            </button>
            <button
              type='button'
              onClick={() => setActivePanel('adjustments')}
              aria-label='Ver vista de ajustes'
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activePanel === 'adjustments' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Ajustes
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
        ) : activePanel === 'logbook' ? (
          <section className='space-y-4'>
            <div className='grid gap-3 md:grid-cols-4'>
              <select
                value={logbookActionFilter}
                onChange={event => setLogbookActionFilter(event.target.value)}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                <option value='all'>Todos los tipos</option>
                {availableLogbookActions.map(action => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
              <select
                value={logbookCategoryFilter}
                onChange={event => setLogbookCategoryFilter(event.target.value as LogbookCategory | 'all')}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                <option value='all'>Todas las categorías</option>
                <option value='sales'>Ventas</option>
                <option value='inventory'>Inventario</option>
                <option value='pos'>POS</option>
                <option value='crm'>CRM</option>
                <option value='system'>Sistema</option>
              </select>
              <select
                value={logbookStatusFilter}
                onChange={event => setLogbookStatusFilter(event.target.value as 'all' | 'success' | 'failed' | 'pending')}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                <option value='all'>Todos los estados</option>
                <option value='success'>Success</option>
                <option value='failed'>Failed</option>
                <option value='pending'>Pending</option>
              </select>
              <input
                value={logbookActorFilter}
                onChange={event => setLogbookActorFilter(event.target.value)}
                placeholder='Filtrar por usuario'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </div>

            <div className='flex justify-end'>
              <button
                type='button'
                onClick={() => setRefreshSeed(current => current + 1)}
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'
              >
                Actualizar bitácora
              </button>
            </div>

            {loadingLogbook ? <p className='text-sm text-slate-500'>Cargando bitácora...</p> : null}

            <article className='rounded-xl border border-slate-200'>
              <header className='border-b border-slate-200 bg-slate-50 px-4 py-3'>
                <h2 className='text-sm font-semibold text-slate-900'>Registro de operaciones del sistema</h2>
                <p className='mt-1 text-xs text-slate-600'>Orden cronológico (más reciente primero)</p>
              </header>
              <div className='overflow-x-auto'>
                <table className='min-w-full divide-y divide-slate-200'>
                  <thead className='bg-white'>
                    <tr>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Fecha</th>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Categoría</th>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Operación</th>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Detalle</th>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Usuario</th>
                      <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Estado</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-slate-100 bg-white'>
                    {logbookItems.map(item => (
                      <tr key={item.id}>
                        <td className='whitespace-nowrap px-3 py-2 text-sm text-slate-700'>
                          {new Date(item.createdAt).toLocaleString('es-MX')}
                        </td>
                        <td className='px-3 py-2 text-sm text-slate-700'>{item.category}</td>
                        <td className='px-3 py-2 text-sm text-slate-800'>
                          <p>{item.actionLabel}</p>
                          <p className='text-xs text-slate-500'>{item.action}</p>
                        </td>
                        <td className='px-3 py-2 text-sm text-slate-700'>{item.details}</td>
                        <td className='px-3 py-2 text-sm text-slate-700'>
                          {item.actorUsername} <span className='text-xs text-slate-500'>({item.actorRole})</span>
                        </td>
                        <td className='px-3 py-2 text-sm text-slate-700'>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!logbookItems.length ? (
                  <p className='px-3 py-4 text-sm text-slate-500'>Sin operaciones para los filtros seleccionados.</p>
                ) : null}
              </div>
            </article>
          </section>
        ) : (
          <section className='space-y-4'>
            <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
              <div className='grid gap-3 md:grid-cols-6'>
                <select
                  value={bulkOperation}
                  onChange={event => setBulkOperation(event.target.value as BulkOperation)}
                  className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                >
                  <option value='correct_price'>Lote: corregir precio</option>
                  <option value='schedule_price'>Lote: programar precio</option>
                  <option value='stock_entry'>Lote: entrada</option>
                  <option value='stock_exit'>Lote: salida</option>
                  <option value='delete_product'>Lote: eliminar</option>
                </select>
                <input
                  value={bulkNewUnitPrice}
                  onChange={event => setBulkNewUnitPrice(event.target.value)}
                  placeholder='Precio lote'
                  className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                />
                <input
                  type='datetime-local'
                  value={bulkEffectiveFrom}
                  onChange={event => setBulkEffectiveFrom(event.target.value)}
                  className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                />
                <input
                  value={bulkQuantity}
                  onChange={event => setBulkQuantity(event.target.value)}
                  placeholder='Cantidad lote'
                  className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                />
                <input
                  value={bulkUnitCost}
                  onChange={event => setBulkUnitCost(event.target.value)}
                  placeholder='Costo lote'
                  className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                />
                <select
                  value={bulkValuationMethod}
                  onChange={event => setBulkValuationMethod(event.target.value as 'fifo' | 'average')}
                  className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                >
                  <option value='fifo'>FIFO</option>
                  <option value='average'>Promedio</option>
                </select>
              </div>
              <div className='mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]'>
                <input
                  value={bulkReason}
                  onChange={event => setBulkReason(event.target.value)}
                  placeholder='Motivo de ajuste masivo'
                  className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                />
                <button
                  type='button'
                  onClick={handleToggleAllSelections}
                  className='h-9 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-white'
                >
                  {effectiveSelectedItemIds.length === items.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
                <button
                  type='button'
                  onClick={() => void handleApplyBulkSameValues()}
                  disabled={!selectedItemsCount || submittingAdjustment}
                  className='h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60'
                >
                  Aplicar mismos datos ({selectedItemsCount})
                </button>
                <button
                  type='button'
                  onClick={() => void handleApplyBulkRowValues()}
                  disabled={!selectedItemsCount || submittingAdjustment}
                  className='h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-60'
                >
                  Aplicar datos por fila
                </button>
              </div>
            </div>

            <div className='overflow-x-auto rounded-xl border border-slate-200'>
              <table className='min-w-[1500px] divide-y divide-slate-200 bg-white'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Sel.</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Producto</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Stock / Precio</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Operación</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Nuevo precio</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Fecha vigencia</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Cantidad</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Costo unitario</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Método</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Motivo</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Acción</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {items.map(item => {
                    const draft = rowDrafts[item.id] || createDefaultRowDraft()
                    const isSelected = effectiveSelectedItemIds.includes(item.id)
                    return (
                      <tr key={item.id} className={isSelected ? 'bg-emerald-50/60' : 'bg-white'}>
                        <td className='px-2 py-2'>
                          <input
                            type='checkbox'
                            checked={isSelected}
                            onChange={() => handleToggleItemSelection(item.id)}
                            aria-label={`Seleccionar ${item.productName}`}
                          />
                        </td>
                        <td className='px-2 py-2 text-xs text-slate-700'>
                          <p className='font-medium text-slate-900'>{item.productName}</p>
                          <p>{item.sku}</p>
                        </td>
                        <td className='px-2 py-2 text-xs text-slate-700'>
                          <p>{item.supportsWeight ? `${(item.stock / 1000).toFixed(3)} kg` : `${item.stock} und`}</p>
                          <p>{formatMxnCurrency(item.unitPrice)}</p>
                        </td>
                        <td className='px-2 py-2'>
                          <select
                            value={draft.operation}
                            onChange={event => updateRowDraft(item.id, { operation: event.target.value as RowAdjustmentOperation })}
                            className='h-8 rounded-md border border-slate-300 px-1 text-xs'
                          >
                            <option value='correct_price'>Corregir precio</option>
                            <option value='schedule_price'>Programar precio</option>
                            <option value='stock_entry'>Entrada</option>
                            <option value='stock_exit'>Salida</option>
                            <option value='delete_product'>Eliminar</option>
                          </select>
                        </td>
                        <td className='px-2 py-2'>
                          <input
                            value={draft.newUnitPrice}
                            onChange={event => updateRowDraft(item.id, { newUnitPrice: event.target.value })}
                            className='h-8 w-28 rounded-md border border-slate-300 px-2 text-xs'
                            placeholder='0.00'
                          />
                        </td>
                        <td className='px-2 py-2'>
                          <input
                            type='datetime-local'
                            value={draft.effectiveFrom}
                            onChange={event => updateRowDraft(item.id, { effectiveFrom: event.target.value })}
                            className='h-8 rounded-md border border-slate-300 px-2 text-xs'
                          />
                        </td>
                        <td className='px-2 py-2'>
                          <input
                            value={draft.quantity}
                            onChange={event => updateRowDraft(item.id, { quantity: event.target.value })}
                            className='h-8 w-20 rounded-md border border-slate-300 px-2 text-xs'
                            placeholder='0'
                          />
                        </td>
                        <td className='px-2 py-2'>
                          <input
                            value={draft.unitCost}
                            onChange={event => updateRowDraft(item.id, { unitCost: event.target.value })}
                            className='h-8 w-24 rounded-md border border-slate-300 px-2 text-xs'
                            placeholder='0.00'
                          />
                        </td>
                        <td className='px-2 py-2'>
                          <select
                            value={draft.valuationMethod}
                            onChange={event => updateRowDraft(item.id, { valuationMethod: event.target.value as 'fifo' | 'average' })}
                            className='h-8 rounded-md border border-slate-300 px-1 text-xs'
                          >
                            <option value='fifo'>FIFO</option>
                            <option value='average'>Promedio</option>
                          </select>
                        </td>
                        <td className='px-2 py-2'>
                          <input
                            value={draft.reason}
                            onChange={event => updateRowDraft(item.id, { reason: event.target.value })}
                            className='h-8 w-48 rounded-md border border-slate-300 px-2 text-xs'
                          />
                        </td>
                        <td className='px-2 py-2'>
                          <button
                            type='button'
                            onClick={() => void handleApplyRowAdjustment(item.id)}
                            disabled={submittingAdjustment}
                            className='h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60'
                          >
                            Aplicar fila
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className='rounded-xl border border-slate-200 p-3'>
              <p className='text-xs font-semibold text-slate-800'>Agregar producto nuevo</p>
              <div className='mt-2 grid gap-2 md:grid-cols-6'>
                <input value={addProductForm.sku} onChange={event => setAddProductForm(current => ({ ...current, sku: event.target.value }))} placeholder='SKU' className='h-8 rounded-md border border-slate-300 px-2 text-xs' />
                <input value={addProductForm.productName} onChange={event => setAddProductForm(current => ({ ...current, productName: event.target.value }))} placeholder='Producto' className='h-8 rounded-md border border-slate-300 px-2 text-xs' />
                <input value={addProductForm.category} onChange={event => setAddProductForm(current => ({ ...current, category: event.target.value }))} placeholder='Categoría' className='h-8 rounded-md border border-slate-300 px-2 text-xs' />
                <input value={addProductForm.stock} onChange={event => setAddProductForm(current => ({ ...current, stock: event.target.value }))} placeholder='Stock' className='h-8 rounded-md border border-slate-300 px-2 text-xs' />
                <input value={addProductForm.unitPrice} onChange={event => setAddProductForm(current => ({ ...current, unitPrice: event.target.value }))} placeholder='Precio' className='h-8 rounded-md border border-slate-300 px-2 text-xs' />
                <div className='flex gap-2'>
                  <input value={addProductForm.aisle} onChange={event => setAddProductForm(current => ({ ...current, aisle: event.target.value }))} placeholder='Pasillo' className='h-8 w-full rounded-md border border-slate-300 px-2 text-xs' />
                  <button type='button' onClick={() => void handleAddProduct()} disabled={submittingAdjustment} className='h-8 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60'>Agregar</button>
                </div>
              </div>
            </div>

            <article className='rounded-xl border border-slate-200 p-3'>
              <p className='text-xs font-semibold text-slate-800'>Programaciones pendientes</p>
              {loadingAdjustments ? <p className='mt-2 text-xs text-slate-500'>Cargando...</p> : null}
              {adjustmentsSnapshot?.schedules?.length ? (
                <ul className='mt-2 space-y-1 text-xs text-slate-700'>
                  {adjustmentsSnapshot.schedules.map(schedule => (
                    <li key={schedule.id}>
                      {schedule.inventoryItemId} | {JSON.stringify(schedule.metadata)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='mt-2 text-xs text-slate-500'>Sin pendientes.</p>
              )}
            </article>
          </section>
        )}
      </section>

      {message ? (
        <p aria-live='polite' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {message}
        </p>
      ) : null}

      {adjustmentResult ? (
        <p aria-live='polite' className='mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>
          {adjustmentResult}
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
