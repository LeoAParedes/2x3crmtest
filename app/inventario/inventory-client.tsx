'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { calculateWeightedAveragePrice } from '@/src/lib/inventory/valuation'
import { formatStockQuantityLabel } from '@/src/lib/inventory/logbook-quantity'
import { DEFAULT_MIN_STOCK, isLowStockItem } from '@/src/lib/inventory/low-stock'
import { inferWeightSupport, kilogramsToGrams } from '@/src/lib/inventory/weight-units'
import { formatMxnCurrency } from '@/src/lib/mxn-currency'
import type { CrmRole } from '@/src/lib/security/rbac'

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

type AdjustmentPayload =
  | {
      operation: 'add_product'
      sku: string
      productName: string
      category: string
      stock: number
      minStock: number
      unitPrice: number
      aisle: string | null
    }
  | {
      operation: 'set_min_stock'
      inventoryItemId: string
      minStock: number
      reason: string
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
    minStock?: number
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

type ToastItem = {
  id: string
  kind: 'success' | 'error' | 'info'
  text: string
}

type RowAdjustmentOperation =
  | 'correct_price'
  | 'schedule_price'
  | 'stock_entry'
  | 'stock_exit'
  | 'set_min_stock'
  | 'delete_product'

type RowAdjustmentDraft = {
  operation: RowAdjustmentOperation
  reason: string
  newUnitPrice: string
  effectiveFrom: string
  quantity: string
  unitCost: string
  valuationMethod: 'fifo' | 'average'
}

type BulkOperation =
  | 'correct_price'
  | 'schedule_price'
  | 'stock_entry'
  | 'stock_exit'
  | 'set_min_stock'
  | 'delete_product'
type RowAdjustmentPayload = Extract<AdjustmentPayload, { operation: RowAdjustmentOperation }>
type SortDirection = 'asc' | 'desc'
type InventorySortField = 'productName' | 'sku' | 'category' | 'stock' | 'unitPrice'
type InventorySearchField = 'category' | 'unitPrice' | 'sku' | 'productName' | 'unit' | 'stock'
type AdjustmentSortField = 'sku' | 'productName' | 'category' | 'stock' | 'unitPrice' | 'operation' | 'reason'

const inventorySearchFieldOptions: Array<{ value: InventorySearchField; label: string }> = [
  { value: 'productName', label: 'Producto' },
  { value: 'sku', label: 'SKU' },
  { value: 'category', label: 'Categorías' },
  { value: 'unitPrice', label: 'Precios en pesos ($)' },
  { value: 'unit', label: 'Unidad' },
  { value: 'stock', label: 'Stock' }
]

const getInventorySearchPlaceholder = (searchField: InventorySearchField) => {
  if (searchField === 'sku') return 'Buscar por SKU'
  if (searchField === 'category') return 'Buscar por categoría'
  if (searchField === 'unitPrice') return 'Buscar precio (ej. 12.50 o >10)'
  if (searchField === 'unit') return 'Buscar unidad (pz, kg, pieza, peso…)'
  if (searchField === 'stock') return 'Buscar stock (ej. 20 o >10)'
  return 'Buscar por producto'
}

type RowAdjustmentPreview = {
  payload: RowAdjustmentPayload
  itemId: string
  itemName: string
  operationLabel: string
  previewLines: string[]
}

const createDefaultRowDraft = (): RowAdjustmentDraft => ({
  operation: 'correct_price',
  reason: 'Ajuste manual de inventario',
  newUnitPrice: '',
  effectiveFrom: '',
  quantity: '',
  unitCost: '',
  valuationMethod: 'fifo'
})

const getRowOperationLabel = (operation: RowAdjustmentOperation) => {
  if (operation === 'correct_price') return 'Corrección de precio'
  if (operation === 'schedule_price') return 'Programación de precio'
  if (operation === 'stock_entry') return 'Entrada de inventario'
  if (operation === 'stock_exit') return 'Salida de inventario'
  if (operation === 'set_min_stock') return 'Umbral de stock bajo'
  return 'Eliminación de producto'
}

const getRequiredFieldFlags = (operation: RowAdjustmentOperation) => ({
  requiresPrice: operation === 'correct_price' || operation === 'schedule_price',
  requiresEffectiveFrom: operation === 'schedule_price',
  requiresQuantity: operation === 'stock_entry' || operation === 'stock_exit' || operation === 'set_min_stock',
  requiresUnitCost: operation === 'stock_entry',
  requiresValuationMethod: operation === 'stock_exit'
})

const getRequiredFieldLabels = (flags: ReturnType<typeof getRequiredFieldFlags>) => {
  const labels = ['Motivo']
  if (flags.requiresPrice) labels.push('Nuevo precio')
  if (flags.requiresEffectiveFrom) labels.push('Fecha vigencia')
  if (flags.requiresQuantity) labels.push('Cantidad / Umbral')
  if (flags.requiresUnitCost) labels.push('Costo unitario')
  if (flags.requiresValuationMethod) labels.push('Método valoración')
  return labels
}

const getLowStockRowClassName = (item: InventoryItem, extraClassName = '') => {
  const base = extraClassName.trim()
  if (!isLowStockItem(item)) return base || undefined
  return [base, 'outline outline-2 -outline-offset-2 outline-orange-500 bg-orange-50/50'].filter(Boolean).join(' ')
}

const getMissingFieldAlertStyle = (isMissing: boolean): CSSProperties | undefined =>
  isMissing
    ? {
        borderColor: '#f59e0b',
        backgroundColor: '#fffbeb',
        boxShadow: '0 0 0 2px #fbbf24'
      }
    : undefined

const normalizeAdjustmentErrorMessage = (message: string) => {
  const lowered = message.toLowerCase()
  if (
    lowered.includes('stock en cero') ||
    lowered.includes('stock en 0') ||
    message.includes('INVENTORY_DELETE_REQUIRES_ZERO_STOCK')
  ) {
    return 'No se pudo eliminar el producto. Actualiza la página e intenta nuevamente.'
  }
  return message
}

const getOperationHelpText = (operation: RowAdjustmentOperation) => {
  if (operation === 'delete_product') {
    return 'Si el producto tiene stock, se registrará salida automática y luego se eliminará del catálogo.'
  }
  if (operation === 'correct_price') {
    return 'Indica el nuevo precio por unidad.'
  }
  if (operation === 'schedule_price') {
    return 'Indica precio y fecha de vigencia.'
  }
  if (operation === 'stock_entry') {
    return 'Indica cantidad (kg para peso, pz para piezas) y costo unitario de entrada.'
  }
  if (operation === 'stock_exit') {
    return 'Indica cantidad a retirar (kg para peso, pz para piezas) y método de valoración.'
  }
  return ''
}

const getRowMissingFields = (draft: RowAdjustmentDraft) => {
  const flags = getRequiredFieldFlags(draft.operation)
  const missing: string[] = []
  if (!draft.reason.trim()) missing.push('Motivo')
  if (flags.requiresPrice && !draft.newUnitPrice.trim()) missing.push('Nuevo precio')
  if (flags.requiresEffectiveFrom && !draft.effectiveFrom.trim()) missing.push('Fecha vigencia')
  if (flags.requiresQuantity && !draft.quantity.trim()) {
    missing.push(draft.operation === 'set_min_stock' ? 'Umbral' : 'Cantidad')
  }
  if (flags.requiresUnitCost && !draft.unitCost.trim()) missing.push('Costo unitario')
  return missing
}

const compareText = (left: string, right: string) =>
  left.localeCompare(right, 'es', {
    sensitivity: 'base',
    numeric: true
  })

const compareNumber = (left: number, right: number) => left - right

const getSortIndicator = (isActive: boolean, direction: SortDirection) => {
  if (!isActive) return '↕'
  return direction === 'asc' ? '▲' : '▼'
}

export const InventoryClient = ({ role }: InventoryClientProps) => {
  const searchParams = useSearchParams()
  const shortcut = searchParams.get('shortcut')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [query, setQuery] = useState('')
  const [searchField, setSearchField] = useState<InventorySearchField>('productName')
  const [sortBy, setSortBy] = useState<InventorySortField>('productName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshSeed, setRefreshSeed] = useState(0)
  const [showArchivedCodes, setShowArchivedCodes] = useState(false)
  const [isInventorySettingsOpen, setIsInventorySettingsOpen] = useState(false)
  const [isLowStockAlertsOpen, setIsLowStockAlertsOpen] = useState(false)
  const [lowStockAlerts, setLowStockAlerts] = useState<InventoryItem[]>([])
  const [loadingLowStockAlerts, setLoadingLowStockAlerts] = useState(false)
  const [activePanelOverride, setActivePanelOverride] = useState<'inventory' | 'adjustments' | null>(null)
  const activePanel: 'inventory' | 'adjustments' =
    activePanelOverride ?? (shortcut === 'ajuste' ? 'adjustments' : 'inventory')

  const setActivePanel = (next: 'inventory' | 'adjustments') => {
    setActivePanelOverride(next)
  }
  const [loadingAdjustments, setLoadingAdjustments] = useState(false)
  const [adjustmentsSnapshot, setAdjustmentsSnapshot] = useState<InventoryAdjustmentsResponse | null>(null)
  const [adjustmentResult, setAdjustmentResult] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [rowPreview, setRowPreview] = useState<RowAdjustmentPreview | null>(null)
  const [bulkPreview, setBulkPreview] = useState<RowAdjustmentPreview[] | null>(null)
  const [validationAttemptedRows, setValidationAttemptedRows] = useState<Record<string, boolean>>({})
  const [adjustmentQuery, setAdjustmentQuery] = useState('')
  const [adjustmentSortBy, setAdjustmentSortBy] = useState<AdjustmentSortField>('sku')
  const [adjustmentSortDirection, setAdjustmentSortDirection] = useState<SortDirection>('asc')
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
    minStock: String(DEFAULT_MIN_STOCK),
    unitPrice: '0',
    aisle: ''
  })
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false)

  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [validatingImport, setValidatingImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [validationResult, setValidationResult] = useState<ImportResponse | null>(null)
  const [importResult, setImportResult] = useState<ImportResponse | null>(null)
  const [lastValidatedCsv, setLastValidatedCsv] = useState('')
  const closeModalButtonRef = useRef<HTMLButtonElement | null>(null)
  const inventoryTableContainerRef = useRef<HTMLDivElement | null>(null)
  const toolbarClusterRef = useRef<HTMLDivElement | null>(null)

  const canValidateImport = useMemo(
    () => importCsv.trim().length > 0 && !importing && !validatingImport,
    [importCsv, importing, validatingImport]
  )
  const hasFreshValidation = useMemo(
    () => Boolean(validationResult?.validateOnly && lastValidatedCsv === importCsv),
    [importCsv, lastValidatedCsv, validationResult]
  )
  const rejectedValidationLines = useMemo(
    () => (validationResult?.errors || []).map(error => error.line),
    [validationResult]
  )
  const rejectedImportLines = useMemo(
    () => (importResult?.errors || []).map(error => error.line),
    [importResult]
  )
  const canSubmitImport = useMemo(
    () => Boolean(hasFreshValidation && validationResult?.canImport && !importing),
    [hasFreshValidation, importing, validationResult]
  )

  const pushToast = (text: string, kind: ToastItem['kind'] = 'info') => {
    const toast: ToastItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      text
    }
    setToasts(current => [...current.slice(-2), toast])
  }

  const logAdjustmentDebug = (runId: string, hypothesisId: string, message: string, data: Record<string, unknown>) => {
    const canSendDebugLog =
      typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    if (!canSendDebugLog) {
      return
    }

    // #region agent log
    fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
      body: JSON.stringify({
        sessionId: '449600',
        runId,
        hypothesisId,
        location: 'app/inventario/inventory-client.tsx',
        message,
        data,
        timestamp: Date.now()
      })
    }).catch(() => {})
    // #endregion
  }

  const dismissToast = (toastId: string) => {
    setToasts(current => current.filter(toast => toast.id !== toastId))
  }

  useEffect(() => {
    let cancelled = false

    const loadInventory = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          q: query,
          searchField,
          sortBy,
          sortDirection,
          page: String(page),
          pageSize: '30',
          includeArchived: String(showArchivedCodes)
        })
        const response = await fetch(`/api/pos/inventory?${params.toString()}`)
        const payload = (await response.json()) as InventoryResponse
        if (!response.ok || !payload.success) {
          throw new Error('No fue posible cargar inventario')
        }
        logAdjustmentDebug(`inventory-page-${Date.now()}`, 'H3', 'inventory page payload loaded', {
          requestedPage: page,
          returnedItems: payload.items.length,
          returnedTotalPages: payload.pagination.totalPages,
          totalItems: payload.pagination.total,
          queryLength: query.length,
          searchField,
          sortBy,
          sortDirection
        })
        if (cancelled) return
        setItems(
          payload.items.map(item => ({
            ...item,
            minStock: typeof item.minStock === 'number' ? item.minStock : DEFAULT_MIN_STOCK
          }))
        )
        setTotalItems(payload.pagination.total)
        setTotalPages(payload.pagination.totalPages)
        if (page > payload.pagination.totalPages) {
          setPage(payload.pagination.totalPages)
        }
      } catch (error) {
        if (!cancelled) {
          pushToast(error instanceof Error ? error.message : 'Error de carga', 'error')
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
  }, [query, searchField, sortBy, sortDirection, page, refreshSeed, showArchivedCodes])

  useEffect(() => {
    let cancelled = false

    const loadLowStockAlerts = async () => {
      setLoadingLowStockAlerts(true)
      try {
        const params = new URLSearchParams({
          alertsOnly: 'true',
          includeArchived: 'false'
        })
        const response = await fetch(`/api/pos/inventory?${params.toString()}`)
        const payload = (await response.json()) as InventoryResponse
        if (!response.ok || !payload.success) {
          throw new Error('No fue posible cargar alertas de stock bajo')
        }
        if (cancelled) return
        setLowStockAlerts(
          payload.items.map(item => ({
            ...item,
            minStock: typeof item.minStock === 'number' ? item.minStock : DEFAULT_MIN_STOCK
          }))
        )
      } catch {
        if (!cancelled) {
          setLowStockAlerts([])
        }
      } finally {
        if (!cancelled) {
          setLoadingLowStockAlerts(false)
        }
      }
    }

    void loadLowStockAlerts()

    return () => {
      cancelled = true
    }
  }, [refreshSeed])

  useEffect(() => {
    if (!isLowStockAlertsOpen && !isInventorySettingsOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (toolbarClusterRef.current?.contains(target)) return
      setIsLowStockAlertsOpen(false)
      setIsInventorySettingsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsLowStockAlertsOpen(false)
      setIsInventorySettingsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isInventorySettingsOpen, isLowStockAlertsOpen])

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
          pushToast(error instanceof Error ? error.message : 'Error de carga de ajustes', 'error')
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
  const adjustmentFilteredItems = useMemo(() => {
    const normalizedQuery = adjustmentQuery.trim().toLowerCase()
    if (!normalizedQuery) return items
    return items.filter(
      item =>
        item.sku.toLowerCase().includes(normalizedQuery) ||
        item.productName.toLowerCase().includes(normalizedQuery) ||
        item.category.toLowerCase().includes(normalizedQuery)
    )
  }, [adjustmentQuery, items])
  const sortedAdjustmentItems = useMemo(() => {
    const indexedItems = adjustmentFilteredItems.map((item, index) => ({ item, index }))
    indexedItems.sort((left, right) => {
      const leftItem = left.item
      const rightItem = right.item
      const leftDraft = rowDrafts[leftItem.id] || createDefaultRowDraft()
      const rightDraft = rowDrafts[rightItem.id] || createDefaultRowDraft()
      let comparison = 0

      if (adjustmentSortBy === 'sku') {
        comparison = compareText(leftItem.sku, rightItem.sku)
      } else if (adjustmentSortBy === 'productName') {
        comparison = compareText(leftItem.productName, rightItem.productName)
      } else if (adjustmentSortBy === 'category') {
        comparison = compareText(leftItem.category, rightItem.category)
      } else if (adjustmentSortBy === 'stock') {
        comparison = compareNumber(leftItem.stock, rightItem.stock)
      } else if (adjustmentSortBy === 'unitPrice') {
        comparison = compareNumber(leftItem.unitPrice, rightItem.unitPrice)
      } else if (adjustmentSortBy === 'operation') {
        comparison = compareText(leftDraft.operation, rightDraft.operation)
      } else {
        comparison = compareText(leftDraft.reason, rightDraft.reason)
      }

      if (comparison === 0) {
        return left.index - right.index
      }

      return adjustmentSortDirection === 'asc' ? comparison : -comparison
    })
    return indexedItems.map(entry => entry.item)
  }, [adjustmentFilteredItems, adjustmentSortBy, adjustmentSortDirection, rowDrafts])
  const effectiveAdjustmentSelectedIds = useMemo(
    () => effectiveSelectedItemIds.filter(id => adjustmentFilteredItems.some(item => item.id === id)),
    [effectiveSelectedItemIds, adjustmentFilteredItems]
  )
  const selectedItemsCount = effectiveSelectedItemIds.length

  const parseNumberInput = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const normalized = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(normalized)) return null
    return normalized
  }

  const toStoredStockQuantity = (quantity: number, supportsWeight: boolean) => {
    if (supportsWeight) return Math.max(1, kilogramsToGrams(quantity))
    return Math.max(1, Math.round(quantity))
  }

  const toStoredMinStock = (minStock: number, supportsWeight: boolean) => {
    if (supportsWeight) return Math.max(0, kilogramsToGrams(minStock))
    return Math.max(0, Math.round(minStock))
  }

  const resolveSupportsWeight = (itemId: string) => {
    const item = items.find(candidate => candidate.id === itemId)
    return item?.supportsWeight ?? false
  }

  useEffect(() => {
    if (!toasts.length) return
    const timeoutId = window.setTimeout(() => {
      setToasts(current => current.slice(1))
    }, 3200)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toasts])

  useEffect(() => {
    if (activePanel !== 'inventory') return
    const node = inventoryTableContainerRef.current
    if (!node) return

    logAdjustmentDebug(`inventory-layout-${Date.now()}`, 'H4', 'inventory table container metrics', {
      page,
      totalPages,
      itemsCount: items.length,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : null,
      containerClientWidth: node.clientWidth,
      containerScrollWidth: node.scrollWidth,
      overflowsHorizontally: node.scrollWidth > node.clientWidth
    })
  }, [activePanel, items.length, page, totalPages])

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

  useEffect(() => {
    if (!isAddProductModalOpen) return

    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAddProductModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscClose)
    return () => {
      window.removeEventListener('keydown', handleEscClose)
    }
  }, [isAddProductModalOpen])

  const handleOpenImportModal = () => {
    if (role !== 'admin') return
    logAdjustmentDebug(`import-open-${Date.now()}`, 'H5', 'import modal opened', {
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : null,
      viewportHeight: typeof window !== 'undefined' ? window.innerHeight : null
    })
    setIsImportModalOpen(true)
    setValidationResult(null)
    setImportResult(null)
    setLastValidatedCsv('')
  }

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false)
  }

  const resetAddProductForm = () => {
    setAddProductForm({
      sku: '',
      productName: '',
      category: '',
      stock: '0',
      minStock: String(DEFAULT_MIN_STOCK),
      unitPrice: '0',
      aisle: ''
    })
  }

  const handleOpenAddProductModal = () => {
    if (role !== 'admin') return
    setIsAddProductModalOpen(true)
  }

  const handleCloseAddProductModal = () => {
    setIsAddProductModalOpen(false)
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
      logAdjustmentDebug(`import-validate-${Date.now()}`, 'H1', 'import validation response', {
        httpOk: response.ok,
        success: payload.success,
        canImport: payload.canImport ?? null,
        previewRows: payload.preview?.rows.length ?? 0,
        totalValidRows: payload.preview?.totalValidRows ?? 0,
        errorsCount: payload.errors?.length ?? 0
      })
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

    const csvToImport = importCsv
    setImporting(true)
    setImportResult(null)
    setIsImportModalOpen(false)
    pushToast('Importación en proceso', 'info')

    try {
      const response = await fetch('/api/inventario/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvToImport })
      })
      const payload = (await response.json()) as ImportResponse
      logAdjustmentDebug(`import-submit-${Date.now()}`, 'H2', 'import submit response', {
        httpOk: response.ok,
        success: payload.success,
        created: payload.summary?.created ?? null,
        updated: payload.summary?.updated ?? null,
        failed: payload.summary?.failed ?? null,
        errorsCount: payload.errors?.length ?? 0
      })
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible importar productos')
      }

      setImportResult(payload)
      setRefreshSeed(current => current + 1)
      pushToast('Importación finalizada', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido durante importación'
      setImportResult({
        success: false,
        message
      })
      pushToast(message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const submitAdjustment = async (payload: AdjustmentPayload): Promise<boolean> => {
    const runId = `delete-ui-${Date.now()}`
    setSubmittingAdjustment(true)
    setAdjustmentResult(null)
    try {
      if (payload.operation === 'delete_product') {
        logAdjustmentDebug(runId, 'H1', 'submit delete request start', {
          inventoryItemId: payload.inventoryItemId,
          itemsCountBeforeRequest: items.length
        })
      }
      const response = await fetch('/api/inventario/ajustes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const result = (await response.json()) as InventoryAdjustmentsResponse
      if (payload.operation === 'delete_product') {
        logAdjustmentDebug(runId, 'H2', 'submit delete response received', {
          httpOk: response.ok,
          successFlag: Boolean(result?.success),
          message: result?.message || null
        })
      }
      if (!response.ok || !result.success) {
        throw new Error(normalizeAdjustmentErrorMessage(result.message || 'No fue posible aplicar el ajuste'))
      }

      setAdjustmentResult(result.message || 'Ajuste aplicado')
      if (result.item) {
        setItems(current =>
          current.map(item =>
            item.id === result.item?.id
              ? {
                  ...item,
                  productName: result.item?.productName || item.productName,
                  category: result.item?.category || item.category,
                  stock: result.item?.stock ?? item.stock,
                  minStock: result.item?.minStock ?? item.minStock,
                  unitPrice: result.item?.unitPrice ?? item.unitPrice
                }
              : item
          )
        )
      }
      if (payload.operation === 'delete_product') {
        setItems(current => {
          const filtered = current.filter(item => item.id !== payload.inventoryItemId)
          logAdjustmentDebug(runId, 'H3', 'local list filtered after delete success', {
            removedInventoryItemId: payload.inventoryItemId,
            beforeCount: current.length,
            afterCount: filtered.length
          })
          return filtered
        })
      }
      pushToast(result.message || 'Ajuste aplicado correctamente', 'success')
      setRefreshSeed(current => current + 1)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error aplicando ajuste'
      pushToast(normalizeAdjustmentErrorMessage(message), 'error')
      return false
    } finally {
      setSubmittingAdjustment(false)
    }
  }

  const handleAddProduct = async () => {
    if (role !== 'admin') return

    const stock = parseNumberInput(addProductForm.stock)
    const minStock = parseNumberInput(addProductForm.minStock)
    const unitPrice = parseNumberInput(addProductForm.unitPrice)
    if (stock === null || minStock === null || unitPrice === null) {
      pushToast('Stock, umbral y precio del producto nuevo deben ser numéricos', 'error')
      return
    }
    if (unitPrice <= 0) {
      pushToast('El precio inicial debe ser mayor a 0', 'error')
      return
    }
    if (stock < 0) {
      pushToast('El stock inicial no puede ser negativo', 'error')
      return
    }
    if (minStock < 0) {
      pushToast('El umbral de stock bajo no puede ser negativo', 'error')
      return
    }

    const supportsWeight = inferWeightSupport(addProductForm.category.trim(), addProductForm.aisle.trim() || null)
    const success = await submitAdjustment({
      operation: 'add_product',
      sku: addProductForm.sku.trim(),
      productName: addProductForm.productName.trim(),
      category: addProductForm.category.trim(),
      stock: supportsWeight ? Math.max(0, kilogramsToGrams(stock)) : Math.max(0, Math.round(stock)),
      minStock: toStoredMinStock(minStock, supportsWeight),
      unitPrice: Number(unitPrice.toFixed(2)),
      aisle: addProductForm.aisle.trim() ? addProductForm.aisle.trim() : null
    })
    if (!success) return

    resetAddProductForm()
    setIsAddProductModalOpen(false)
  }

  const handleToggleItemSelection = (itemId: string) => {
    setSelectedItemIds(current =>
      current.includes(itemId) ? current.filter(id => id !== itemId) : [...current, itemId]
    )
  }

  const handleToggleAllSelections = () => {
    if (effectiveAdjustmentSelectedIds.length === sortedAdjustmentItems.length) {
      setSelectedItemIds([])
      return
    }
    setSelectedItemIds(sortedAdjustmentItems.map(item => item.id))
  }

  const handleActivePanelChange = (panel: 'inventory' | 'adjustments') => {
    setIsInventorySettingsOpen(false)
    setIsLowStockAlertsOpen(false)
    setActivePanel(panel)
  }

  const handleInventoryHeaderSort = (field: InventorySortField) => {
    setPage(1)
    if (sortBy === field) {
      setSortDirection(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortDirection('asc')
  }
  const handleAdjustmentHeaderSort = (field: AdjustmentSortField) => {
    if (adjustmentSortBy === field) {
      setAdjustmentSortDirection(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setAdjustmentSortBy(field)
    setAdjustmentSortDirection('asc')
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

  const buildRowPayload = (itemId: string, draft: RowAdjustmentDraft): RowAdjustmentPayload | null => {
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
      if (parsedPrice <= 0) {
        throw new Error('El precio de corrección debe ser mayor a 0')
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
      if (parsedPrice <= 0) {
        throw new Error('El precio programado debe ser mayor a 0')
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
      if (quantity <= 0 || unitCost <= 0) {
        throw new Error('Cantidad y costo de entrada deben ser mayores a 0')
      }
      return {
        operation: 'stock_entry',
        inventoryItemId: itemId,
        quantity: toStoredStockQuantity(quantity, resolveSupportsWeight(itemId)),
        unitCost: Number(unitCost.toFixed(2)),
        reason: normalizedReason
      }
    }

    if (draft.operation === 'set_min_stock') {
      const minStock = parseNumberInput(draft.quantity)
      if (minStock === null) {
        throw new Error('Umbral de stock bajo inválido')
      }
      if (minStock < 0) {
        throw new Error('El umbral de stock bajo no puede ser negativo')
      }
      return {
        operation: 'set_min_stock',
        inventoryItemId: itemId,
        minStock: toStoredMinStock(minStock, resolveSupportsWeight(itemId)),
        reason: normalizedReason
      }
    }

    const quantity = parseNumberInput(draft.quantity)
    if (quantity === null) {
      throw new Error('Cantidad inválida para salida')
    }
    if (quantity <= 0) {
      throw new Error('La cantidad de salida debe ser mayor a 0')
    }
    return {
      operation: 'stock_exit',
      inventoryItemId: itemId,
      quantity: toStoredStockQuantity(quantity, resolveSupportsWeight(itemId)),
      valuationMethod: draft.valuationMethod,
      reason: normalizedReason
    }
  }

  const buildRowPreview = (item: InventoryItem, payload: RowAdjustmentPayload): RowAdjustmentPreview => {
    const currentStockLabel = formatStockQuantityLabel(item.stock, item.supportsWeight)
    const currentPriceLabel = formatMxnCurrency(item.unitPrice)
    const lines: string[] = [
      `Stock actual: ${currentStockLabel}`,
      `Precio actual: ${currentPriceLabel}`
    ]

    if (payload.operation === 'correct_price') {
      lines.push(`Nuevo precio por unidad: ${formatMxnCurrency(payload.newUnitPrice)}`)
    }

    if (payload.operation === 'schedule_price') {
      lines.push(`Precio programado: ${formatMxnCurrency(payload.newUnitPrice)}`)
      lines.push(`Fecha de vigencia: ${new Date(payload.effectiveFrom).toLocaleString('es-MX')}`)
    }

    if (payload.operation === 'stock_entry') {
      const nextStock = item.stock + payload.quantity
      const weightedAverageFormula = `(${item.stock} x ${item.unitPrice.toFixed(2)} + ${payload.quantity} x ${payload.unitCost.toFixed(
        2
      )}) / ${nextStock}`
      const nextPrice = calculateWeightedAveragePrice({
        currentStock: item.stock,
        currentUnitPrice: item.unitPrice,
        incomingQuantity: payload.quantity,
        incomingUnitCost: payload.unitCost
      })
      const nextStockLabel = item.supportsWeight ? `${(nextStock / 1000).toFixed(3)} kg` : `${nextStock} pz`
      lines.push(
        item.supportsWeight
          ? `Entrada: +${(payload.quantity / 1000).toFixed(3)} kg`
          : `Entrada: +${payload.quantity} pz`
      )
      lines.push(`Costo de entrada: ${formatMxnCurrency(payload.unitCost)}`)
      lines.push(`Stock proyectado: ${nextStockLabel}`)
      lines.push(`Precio promedio proyectado: ${formatMxnCurrency(nextPrice)}`)
      lines.push(`Fórmula aplicada: ${weightedAverageFormula}`)
      lines.push('Regla: un costo más bajo reduce el precio promedio, uno más alto lo incrementa')
    }

    if (payload.operation === 'stock_exit') {
      const nextStock = Math.max(0, item.stock - payload.quantity)
      const nextStockLabel = item.supportsWeight ? `${(nextStock / 1000).toFixed(3)} kg` : `${nextStock} pz`
      lines.push(
        item.supportsWeight
          ? `Salida: -${(payload.quantity / 1000).toFixed(3)} kg`
          : `Salida: -${payload.quantity} pz`
      )
      lines.push(`Método de valoración: ${payload.valuationMethod === 'fifo' ? 'FIFO' : 'Promedio general'}`)
      lines.push(`Stock proyectado: ${nextStockLabel}`)
      if (payload.valuationMethod === 'fifo') {
        lines.push('Precio proyectado: se recalcula por lotes FIFO')
      } else {
        lines.push(`Precio proyectado: ${currentPriceLabel}`)
      }
    }

    if (payload.operation === 'set_min_stock') {
      lines.push(`Umbral actual: ${formatStockQuantityLabel(item.minStock, item.supportsWeight)}`)
      lines.push(`Nuevo umbral de stock bajo: ${formatStockQuantityLabel(payload.minStock, item.supportsWeight)}`)
      if (item.stock <= payload.minStock) {
        lines.push('El producto quedará en alerta de stock bajo')
      } else {
        lines.push('El producto quedará fuera de alerta de stock bajo')
      }
    }

    if (payload.operation === 'delete_product') {
      lines.push('Acción: eliminación del producto en catálogo')
      if (item.stock > 0) {
        const stockLabel = formatStockQuantityLabel(item.stock, item.supportsWeight)
        lines.push(`Inventario actual: ${stockLabel}`)
        lines.push(`Se registrará salida automática de ${stockLabel}`)
        lines.push('Después se eliminará el producto del catálogo')
      } else {
        lines.push('Inventario actual: 0 unidades')
        lines.push('Se eliminará el producto del catálogo')
      }
    }

    lines.push(`Motivo: ${payload.reason}`)

    return {
      payload,
      itemId: item.id,
      itemName: `${item.sku} - ${item.productName}`,
      operationLabel: getRowOperationLabel(payload.operation),
      previewLines: lines
    }
  }

  const handleApplyRowAdjustment = async (itemId: string) => {
    const draft = rowDrafts[itemId] || createDefaultRowDraft()
    const missingFields = getRowMissingFields(draft)
    if (missingFields.length) {
      setValidationAttemptedRows(current => ({ ...current, [itemId]: true }))
      pushToast(`Completa los campos requeridos: ${missingFields.join(', ')}`, 'error')
      return
    }

    try {
      const payload = buildRowPayload(itemId, draft)
      if (!payload) return
      const item = items.find(candidate => candidate.id === itemId)
      if (!item) {
        throw new Error('Producto no encontrado para previsualización')
      }
      setBulkPreview(null)
      setRowPreview(buildRowPreview(item, payload))
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'No fue posible aplicar ajuste de fila', 'error')
    }
  }

  const handleConfirmRowAdjustment = async () => {
    if (!rowPreview) return
    const payload = rowPreview.payload
    setRowPreview(null)
    await submitAdjustment(payload)
  }

  const buildBulkPreviews = (mode: 'same' | 'per_row') => {
    const previews: RowAdjustmentPreview[] = []
    for (const itemId of effectiveSelectedItemIds) {
      const item = items.find(candidate => candidate.id === itemId)
      if (!item) continue
      const draft = mode === 'per_row' ? rowDrafts[itemId] || createDefaultRowDraft() : null
      if (mode === 'per_row' && draft) {
        const missingFields = getRowMissingFields(draft)
        if (missingFields.length) {
          setValidationAttemptedRows(current => ({ ...current, [itemId]: true }))
          throw new Error(`${item.productName}: faltan ${missingFields.join(', ')}`)
        }
      }
      const payload = mode === 'per_row' ? buildRowPayload(itemId, draft || createDefaultRowDraft()) : buildBulkPayloadForItem(itemId)
      if (!payload || payload.operation === 'add_product') continue
      previews.push(buildRowPreview(item, payload))
    }
    return previews
  }

  const handleOpenBulkPreview = (mode: 'same' | 'per_row') => {
    if (!effectiveSelectedItemIds.length) {
      pushToast('Selecciona al menos un producto para ajuste masivo', 'error')
      return
    }

    try {
      const previews = buildBulkPreviews(mode)
      if (!previews.length) {
        pushToast('No hay ajustes válidos para previsualizar', 'error')
        return
      }
      setRowPreview(null)
      setBulkPreview(previews)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'No fue posible previsualizar ajuste masivo', 'error')
    }
  }

  const handleConfirmBulkAdjustment = async () => {
    if (!bulkPreview?.length) return
    const payloads = bulkPreview.map(preview => preview.payload)
    setBulkPreview(null)
    for (const payload of payloads) {
      await submitAdjustment(payload)
    }
    setAdjustmentResult(`Ajuste masivo aplicado en ${payloads.length} producto(s)`)
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
      if (parsed <= 0) {
        throw new Error('El precio de corrección en lote debe ser mayor a 0')
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
      if (parsed <= 0) {
        throw new Error('El precio programado en lote debe ser mayor a 0')
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
      if (quantity <= 0 || unitCost <= 0) {
        throw new Error('Cantidad y costo de entrada en lote deben ser mayores a 0')
      }
      return {
        operation: 'stock_entry',
        inventoryItemId: itemId,
        quantity: toStoredStockQuantity(quantity, resolveSupportsWeight(itemId)),
        unitCost: Number(unitCost.toFixed(2)),
        reason: normalizedReason
      }
    }

    if (bulkOperation === 'set_min_stock') {
      const minStock = parseNumberInput(bulkQuantity)
      if (minStock === null) {
        throw new Error('Umbral de stock bajo inválido para lote')
      }
      if (minStock < 0) {
        throw new Error('El umbral de stock bajo en lote no puede ser negativo')
      }
      return {
        operation: 'set_min_stock',
        inventoryItemId: itemId,
        minStock: toStoredMinStock(minStock, resolveSupportsWeight(itemId)),
        reason: normalizedReason
      }
    }

    const quantity = parseNumberInput(bulkQuantity)
    if (quantity === null) {
      throw new Error('Cantidad inválida para salida en lote')
    }
    if (quantity <= 0) {
      throw new Error('La cantidad de salida en lote debe ser mayor a 0')
    }
    return {
      operation: 'stock_exit',
      inventoryItemId: itemId,
      quantity: toStoredStockQuantity(quantity, resolveSupportsWeight(itemId)),
      valuationMethod: bulkValuationMethod,
      reason: normalizedReason
    }
  }

  const canRenderPortal = typeof document !== 'undefined'

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-2xl font-semibold text-slate-950'>Inventario operativo</h1>
        <p className='mt-2 text-sm text-slate-600'>
          Búsqueda por SKU/nombre, ordenamiento y paginación para control diario de productos.
        </p>
      </section>

      <section className='mt-6 w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
        <div className='mb-5 flex w-full min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'>
          <div className='inline-flex rounded-lg border border-slate-300 bg-white p-1'>
            <button
              type='button'
              onClick={() => handleActivePanelChange('inventory')}
              aria-label='Ver vista de inventario'
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activePanel === 'inventory' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Inventario
            </button>
            <button
              type='button'
              onClick={() => handleActivePanelChange('adjustments')}
              aria-label='Ver vista de ajustes'
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activePanel === 'adjustments' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Ajustes
            </button>
          </div>
          <div className='flex items-center gap-2'>
            {role === 'admin' ? (
              <button
                type='button'
                onClick={handleOpenAddProductModal}
                aria-label='Agregar producto nuevo'
                className='rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700'
              >
                Agregar producto nuevo
              </button>
            ) : null}
            {role === 'admin' ? (
              <button
                type='button'
                onClick={handleOpenImportModal}
                aria-label='Abrir importación de productos'
                className='rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50'
              >
                Importación
              </button>
            ) : null}
            <div ref={toolbarClusterRef} className='relative flex flex-col items-center gap-1'>
              <div className='relative'>
                <button
                  type='button'
                  onClick={() => {
                    setIsInventorySettingsOpen(false)
                    setIsLowStockAlertsOpen(current => !current)
                  }}
                  aria-label={
                    lowStockAlerts.length > 0
                      ? `Alertas de stock bajo, ${lowStockAlerts.length} productos`
                      : 'Alertas de stock bajo'
                  }
                  aria-expanded={isLowStockAlertsOpen}
                  aria-haspopup='dialog'
                  className='relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg text-slate-700 hover:bg-slate-100'
                >
                  <span aria-hidden='true'>🔔</span>
                  {lowStockAlerts.length > 0 ? (
                    <span className='absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-4 text-white'>
                      {lowStockAlerts.length > 99 ? '99+' : lowStockAlerts.length}
                    </span>
                  ) : null}
                </button>
                {isLowStockAlertsOpen ? (
                  <div
                    role='dialog'
                    aria-label='Lista de productos con stock bajo'
                    className='absolute right-0 top-12 z-30 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg'
                  >
                    <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Stock bajo</p>
                    <p className='mt-1 text-xs text-slate-600'>
                      Productos en o por debajo de su umbral, más urgentes primero.
                    </p>
                    {loadingLowStockAlerts ? (
                      <p className='mt-3 text-sm text-slate-500'>Cargando alertas...</p>
                    ) : lowStockAlerts.length === 0 ? (
                      <p className='mt-3 text-sm text-slate-500'>No hay productos con stock bajo.</p>
                    ) : (
                      <ul className='mt-3 max-h-64 space-y-2 overflow-y-auto'>
                        {lowStockAlerts.map(item => (
                          <li
                            key={item.id}
                            className='rounded-lg border border-orange-500 bg-orange-50/60 px-3 py-2'
                          >
                            <p className='text-sm font-medium text-slate-900'>{item.productName}</p>
                            <p className='text-xs text-slate-600'>
                              SKU {item.sku} · Stock {formatStockQuantityLabel(item.stock, item.supportsWeight)} / umbral{' '}
                              {formatStockQuantityLabel(item.minStock, item.supportsWeight)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
              <div className='relative'>
                <button
                  type='button'
                  onClick={() => {
                    setIsLowStockAlertsOpen(false)
                    setIsInventorySettingsOpen(current => !current)
                  }}
                  aria-label='Abrir configuración de inventario'
                  aria-expanded={isInventorySettingsOpen}
                  className='inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg text-slate-700 hover:bg-slate-100'
                >
                  ⚙️
                </button>
                {isInventorySettingsOpen ? (
                  <div className='absolute right-0 top-12 z-20 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg'>
                    <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Visualización</p>
                    <label className='mt-2 flex items-center gap-2 text-sm text-slate-700'>
                      <input
                        type='checkbox'
                        checked={showArchivedCodes}
                        onChange={event => {
                          setShowArchivedCodes(event.target.checked)
                          setPage(1)
                        }}
                      />
                      Ver códigos archivados
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {activePanel === 'inventory' ? (
          <div className='w-full min-w-0 space-y-4'>
            <div className='grid w-full gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto]'>
              <label className='sr-only' htmlFor='inventory-search-field'>
                Campo de búsqueda
              </label>
              <select
                id='inventory-search-field'
                value={searchField}
                onChange={event => {
                  setPage(1)
                  setSearchField(event.target.value as InventorySearchField)
                }}
                aria-label='Campo de búsqueda de inventario'
                className='h-10 w-full min-w-[11rem] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 md:w-auto'
              >
                {inventorySearchFieldOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                value={query}
                onChange={event => {
                  setPage(1)
                  setQuery(event.target.value)
                }}
                placeholder={getInventorySearchPlaceholder(searchField)}
                aria-label={`Buscar inventario por ${inventorySearchFieldOptions.find(option => option.value === searchField)?.label || 'campo'}`}
                className='h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm'
              />
              <p className='self-center text-xs text-slate-600'>
                Total: {totalItems} | Página {page}/{totalPages}
              </p>
            </div>

            <div ref={inventoryTableContainerRef} className='w-full max-w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200'>
              <table className='w-full min-w-full table-fixed divide-y divide-slate-200 bg-white'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='w-[14%] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      <button
                        type='button'
                        onClick={() => handleInventoryHeaderSort('sku')}
                        className='inline-flex items-center gap-1 text-left'
                      >
                        SKU
                        <span className='text-[10px]'>{getSortIndicator(sortBy === 'sku', sortDirection)}</span>
                      </button>
                    </th>
                    <th className='w-[46%] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      <button
                        type='button'
                        onClick={() => handleInventoryHeaderSort('productName')}
                        className='inline-flex items-center gap-1 text-left'
                      >
                        Producto
                        <span className='text-[10px]'>{getSortIndicator(sortBy === 'productName', sortDirection)}</span>
                      </button>
                    </th>
                    <th className='w-[14%] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      <button
                        type='button'
                        onClick={() => handleInventoryHeaderSort('stock')}
                        className='inline-flex items-center gap-1 text-left'
                      >
                        Stock
                        <span className='text-[10px]'>{getSortIndicator(sortBy === 'stock', sortDirection)}</span>
                      </button>
                    </th>
                    <th className='w-[14%] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      <button
                        type='button'
                        onClick={() => handleInventoryHeaderSort('unitPrice')}
                        className='inline-flex items-center gap-1 text-left'
                      >
                        Precio
                        <span className='text-[10px]'>{getSortIndicator(sortBy === 'unitPrice', sortDirection)}</span>
                      </button>
                    </th>
                    <th className='w-[12%] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      <button
                        type='button'
                        onClick={() => handleInventoryHeaderSort('category')}
                        className='inline-flex items-center gap-1 text-left'
                      >
                        Tipo
                        <span className='text-[10px]'>{getSortIndicator(sortBy === 'category', sortDirection)}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100 bg-white'>
                  {items.map(item => (
                    <tr key={item.id} className={getLowStockRowClassName(item)}>
                      <td className='px-3 py-2 text-sm text-slate-700'>{item.sku}</td>
                      <td className='px-3 py-2 text-sm text-slate-900'>
                        <p className='font-medium'>{item.productName}</p>
                        <p className='text-xs text-slate-500'>{item.category}</p>
                        {isLowStockItem(item) ? (
                          <p className='mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800'>
                            Stock bajo (umbral {formatStockQuantityLabel(item.minStock, item.supportsWeight)})
                          </p>
                        ) : null}
                        {item.aisle === '__archived__' ? (
                          <p className='mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800'>
                            Archivado
                          </p>
                        ) : null}
                      </td>
                      <td className='px-3 py-2 text-sm text-slate-700'>
                        {formatStockQuantityLabel(item.stock, item.supportsWeight)}
                      </td>
                      <td className='px-3 py-2 text-sm text-slate-700'>{formatMxnCurrency(item.unitPrice)}</td>
                      <td className='px-3 py-2 text-sm text-slate-700'>{item.supportsWeight ? 'Peso' : 'Pieza'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!items.length ? <p className='px-3 py-4 text-sm text-slate-500'>Sin productos para los filtros seleccionados.</p> : null}
            </div>

            <div className='flex items-center justify-between text-sm text-slate-600'>
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
          </div>
        ) : (
          <div className='w-full min-w-0 space-y-4'>
            <div className='grid w-full gap-3 md:grid-cols-[minmax(0,1fr)_auto]'>
              <input
                value={adjustmentQuery}
                onChange={event => setAdjustmentQuery(event.target.value)}
                placeholder='Buscar en ajustes por SKU o nombre'
                className='h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm'
              />
              <p className='self-center text-xs text-slate-500'>
                Mostrando {sortedAdjustmentItems.length} de {items.length} producto(s)
              </p>
            </div>

            <div className='w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3'>
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
                  <option value='set_min_stock'>Lote: umbral stock bajo</option>
                  <option value='delete_product'>Lote: eliminar</option>
                </select>
                {bulkOperation === 'correct_price' || bulkOperation === 'schedule_price' ? (
                  <input
                    value={bulkNewUnitPrice}
                    onChange={event => setBulkNewUnitPrice(event.target.value)}
                    placeholder='Precio lote'
                    className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                  />
                ) : (
                  <div className='h-9 rounded-lg border border-dashed border-slate-200 bg-slate-100' />
                )}
                {bulkOperation === 'schedule_price' ? (
                  <input
                    type='datetime-local'
                    value={bulkEffectiveFrom}
                    onChange={event => setBulkEffectiveFrom(event.target.value)}
                    className='h-9 w-full min-w-0 rounded-lg border border-slate-300 px-2 text-xs'
                  />
                ) : (
                  <div className='h-9 rounded-lg border border-dashed border-slate-200 bg-slate-100' />
                )}
                {bulkOperation === 'stock_entry' || bulkOperation === 'stock_exit' || bulkOperation === 'set_min_stock' ? (
                  <input
                    value={bulkQuantity}
                    onChange={event => setBulkQuantity(event.target.value)}
                    placeholder={bulkOperation === 'set_min_stock' ? 'Umbral lote' : 'Cantidad lote'}
                    className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                  />
                ) : (
                  <div className='h-9 rounded-lg border border-dashed border-slate-200 bg-slate-100' />
                )}
                {bulkOperation === 'stock_entry' ? (
                  <input
                    value={bulkUnitCost}
                    onChange={event => setBulkUnitCost(event.target.value)}
                    placeholder='Costo lote'
                    className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                  />
                ) : (
                  <div className='h-9 rounded-lg border border-dashed border-slate-200 bg-slate-100' />
                )}
                {bulkOperation === 'stock_exit' ? (
                  <select
                    value={bulkValuationMethod}
                    onChange={event => setBulkValuationMethod(event.target.value as 'fifo' | 'average')}
                    className='h-9 rounded-lg border border-slate-300 px-2 text-xs'
                  >
                    <option value='fifo'>FIFO</option>
                    <option value='average'>Promedio</option>
                  </select>
                ) : (
                  <div className='h-9 rounded-lg border border-dashed border-slate-200 bg-slate-100' />
                )}
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
                  {effectiveAdjustmentSelectedIds.length === sortedAdjustmentItems.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
                <button
                  type='button'
                  onClick={() => handleOpenBulkPreview('same')}
                  disabled={!selectedItemsCount || submittingAdjustment}
                  className='h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60'
                >
                  Previsualizar mismos datos ({selectedItemsCount})
                </button>
                <button
                  type='button'
                  onClick={() => handleOpenBulkPreview('per_row')}
                  disabled={!selectedItemsCount || submittingAdjustment}
                  className='h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-60'
                >
                  Previsualizar datos por fila
                </button>
              </div>
            </div>

            <div className='w-full max-w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200'>
              <div className='border-b border-slate-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800'>
                Campos obligatorios para la operación elegida se resaltan en ámbar (*)
              </div>
              <table className='w-full min-w-full divide-y divide-slate-200 bg-white'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Sel.</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>
                      <button type='button' onClick={() => handleAdjustmentHeaderSort('sku')} className='inline-flex items-center gap-1'>
                        SKU
                        <span className='text-[10px]'>{getSortIndicator(adjustmentSortBy === 'sku', adjustmentSortDirection)}</span>
                      </button>
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>
                      <button type='button' onClick={() => handleAdjustmentHeaderSort('productName')} className='inline-flex items-center gap-1'>
                        Nombre
                        <span className='text-[10px]'>{getSortIndicator(adjustmentSortBy === 'productName', adjustmentSortDirection)}</span>
                      </button>
                      <button
                        type='button'
                        onClick={() => handleAdjustmentHeaderSort('category')}
                        className='ml-2 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600'
                      >
                        cat.
                        <span className='text-[10px]'>{getSortIndicator(adjustmentSortBy === 'category', adjustmentSortDirection)}</span>
                      </button>
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <button type='button' onClick={() => handleAdjustmentHeaderSort('stock')} className='inline-flex items-center gap-1'>
                          Stock
                          <span className='text-[10px]'>{getSortIndicator(adjustmentSortBy === 'stock', adjustmentSortDirection)}</span>
                        </button>
                        <button type='button' onClick={() => handleAdjustmentHeaderSort('unitPrice')} className='inline-flex items-center gap-1'>
                          Precio
                          <span className='text-[10px]'>{getSortIndicator(adjustmentSortBy === 'unitPrice', adjustmentSortDirection)}</span>
                        </button>
                      </div>
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>
                      <button type='button' onClick={() => handleAdjustmentHeaderSort('operation')} className='inline-flex items-center gap-1'>
                        Operación
                        <span className='text-[10px]'>{getSortIndicator(adjustmentSortBy === 'operation', adjustmentSortDirection)}</span>
                      </button>
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Nuevo precio</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Fecha vigencia</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Cantidad / Umbral</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Costo unitario</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Método</th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>
                      <button type='button' onClick={() => handleAdjustmentHeaderSort('reason')} className='inline-flex items-center gap-1'>
                        Motivo
                        <span className='text-[10px]'>{getSortIndicator(adjustmentSortBy === 'reason', adjustmentSortDirection)}</span>
                      </button>
                    </th>
                    <th className='px-2 py-2 text-left text-xs font-semibold text-slate-500'>Acción</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {sortedAdjustmentItems.map(item => {
                    const draft = rowDrafts[item.id] || createDefaultRowDraft()
                    const isSelected = effectiveSelectedItemIds.includes(item.id)
                    const requiredFlags = getRequiredFieldFlags(draft.operation)
                    const requiredLabels = getRequiredFieldLabels(requiredFlags)
                    const missingPrice = requiredFlags.requiresPrice && !draft.newUnitPrice.trim()
                    const missingEffectiveFrom = requiredFlags.requiresEffectiveFrom && !draft.effectiveFrom.trim()
                    const missingQuantity = requiredFlags.requiresQuantity && !draft.quantity.trim()
                    const missingUnitCost = requiredFlags.requiresUnitCost && !draft.unitCost.trim()
                    const missingReason = !draft.reason.trim()
                    const showValidationHints = validationAttemptedRows[item.id] === true
                    const requiredInputClass = (isMissing: boolean) =>
                      `h-8 rounded-md border px-2 text-xs ${
                        isMissing ? 'border-amber-500 bg-amber-50' : 'border-slate-300'
                      }`
                    const fieldAlertStyle = (isMissing: boolean) =>
                      showValidationHints || isMissing ? getMissingFieldAlertStyle(isMissing) : undefined

                    return (
                      <tr key={item.id} className={getLowStockRowClassName(item, isSelected ? 'bg-emerald-50/60' : 'bg-white')}>
                        <td className='px-2 py-2'>
                          <input
                            type='checkbox'
                            checked={isSelected}
                            onChange={() => handleToggleItemSelection(item.id)}
                            aria-label={`Seleccionar ${item.productName}`}
                          />
                        </td>
                        <td className='px-2 py-2 text-xs text-slate-700'>
                          <p className='font-medium text-slate-900'>{item.sku}</p>
                        </td>
                        <td className='px-2 py-2 text-xs text-slate-700'>
                          <p className='font-medium text-slate-900'>{item.productName}</p>
                          <p className='text-slate-500'>{item.category}</p>
                          {isLowStockItem(item) ? (
                            <p className='mt-1 text-[11px] font-medium text-orange-700'>
                              Stock bajo · umbral {formatStockQuantityLabel(item.minStock, item.supportsWeight)}
                            </p>
                          ) : null}
                        </td>
                        <td className='px-2 py-2 text-xs text-slate-700'>
                          <p>{formatStockQuantityLabel(item.stock, item.supportsWeight)}</p>
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
                            <option value='set_min_stock'>Umbral stock bajo</option>
                            <option value='delete_product'>Eliminar</option>
                          </select>
                        </td>
                        <td className='px-2 py-2'>
                          {requiredFlags.requiresPrice ? (
                            <input
                              value={draft.newUnitPrice}
                              onChange={event => updateRowDraft(item.id, { newUnitPrice: event.target.value })}
                              style={fieldAlertStyle(missingPrice)}
                              className={`${requiredInputClass(missingPrice)} w-28`}
                              placeholder='0.00 *'
                            />
                          ) : (
                            <span className='text-xs text-slate-400'>—</span>
                          )}
                        </td>
                        <td className='px-2 py-2'>
                          {requiredFlags.requiresEffectiveFrom ? (
                            <input
                              type='datetime-local'
                              value={draft.effectiveFrom}
                              onChange={event => updateRowDraft(item.id, { effectiveFrom: event.target.value })}
                              style={fieldAlertStyle(missingEffectiveFrom)}
                              className={`${requiredInputClass(missingEffectiveFrom)} w-full min-w-0`}
                            />
                          ) : (
                            <span className='text-xs text-slate-400'>—</span>
                          )}
                        </td>
                        <td className='px-2 py-2'>
                          {requiredFlags.requiresQuantity ? (
                            <input
                              value={draft.quantity}
                              onChange={event => updateRowDraft(item.id, { quantity: event.target.value })}
                              style={fieldAlertStyle(missingQuantity)}
                              className={`${requiredInputClass(missingQuantity)} w-20`}
                              placeholder={draft.operation === 'set_min_stock' ? 'Umbral *' : '0 *'}
                              aria-label={draft.operation === 'set_min_stock' ? 'Umbral de stock bajo' : 'Cantidad'}
                            />
                          ) : (
                            <span className='text-xs text-slate-400'>—</span>
                          )}
                        </td>
                        <td className='px-2 py-2'>
                          {requiredFlags.requiresUnitCost ? (
                            <input
                              value={draft.unitCost}
                              onChange={event => updateRowDraft(item.id, { unitCost: event.target.value })}
                              style={fieldAlertStyle(missingUnitCost)}
                              className={`${requiredInputClass(missingUnitCost)} w-24`}
                              placeholder='0.00 *'
                            />
                          ) : (
                            <span className='text-xs text-slate-400'>—</span>
                          )}
                        </td>
                        <td className='px-2 py-2'>
                          {requiredFlags.requiresValuationMethod ? (
                            <select
                              value={draft.valuationMethod}
                              onChange={event => updateRowDraft(item.id, { valuationMethod: event.target.value as 'fifo' | 'average' })}
                              className='h-8 rounded-md border border-slate-300 px-1 text-xs'
                            >
                              <option value='fifo'>FIFO</option>
                              <option value='average'>Promedio</option>
                            </select>
                          ) : (
                            <span className='text-xs text-slate-400'>—</span>
                          )}
                        </td>
                        <td className='px-2 py-2'>
                          <input
                            value={draft.reason}
                            onChange={event => updateRowDraft(item.id, { reason: event.target.value })}
                            style={fieldAlertStyle(missingReason)}
                            className={`${requiredInputClass(missingReason)} w-48`}
                          />
                        </td>
                        <td className='px-2 py-2'>
                          <div className='space-y-1'>
                            <p className='text-[11px] text-slate-600'>Requeridos: {requiredLabels.join(', ')}</p>
                            {getOperationHelpText(draft.operation) ? (
                              <p className='text-[11px] text-slate-500'>{getOperationHelpText(draft.operation)}</p>
                            ) : null}
                            <button
                              type='button'
                              onClick={() => void handleApplyRowAdjustment(item.id)}
                              disabled={submittingAdjustment}
                              className='h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60'
                            >
                              Previsualizar y confirmar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!sortedAdjustmentItems.length ? (
                <p className='px-3 py-4 text-sm text-slate-500'>Sin productos que coincidan con la búsqueda de ajustes.</p>
              ) : null}
            </div>

            <article className='w-full min-w-0 rounded-xl border border-slate-200 p-3'>
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
          </div>
        )}
      </section>

      {adjustmentResult ? (
        <p aria-live='polite' className='mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>
          {adjustmentResult}
        </p>
      ) : null}

      {canRenderPortal && rowPreview
        ? createPortal(
            <div
              className='fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4'
              onMouseDown={event => {
                if (event.target === event.currentTarget) {
                  setRowPreview(null)
                }
              }}
            >
              <section
                role='dialog'
                aria-modal='true'
                aria-label='Previsualización de ajuste'
                className='w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl'
              >
                <div className='flex items-start justify-between gap-3 border-b border-slate-200 pb-3'>
                  <div>
                    <h2 className='text-lg font-semibold text-slate-900'>Confirmar ajuste de inventario</h2>
                    <p className='mt-1 text-sm text-slate-600'>{rowPreview.itemName}</p>
                  </div>
                  <button
                    type='button'
                    onClick={() => setRowPreview(null)}
                    className='rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100'
                  >
                    Cerrar
                  </button>
                </div>

                <div className='mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700'>
                  <p className='font-semibold text-slate-900'>Operación: {rowPreview.operationLabel}</p>
                  <p className='mt-1 text-xs text-slate-600'>
                    Revisa los cambios antes de confirmar. Esta acción actualizará inventario y bitácora.
                  </p>
                  <ul className='mt-2 list-disc space-y-1 pl-5'>
                    {rowPreview.previewLines.map(line => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>

                <div className='mt-4 flex items-center justify-end gap-2'>
                  <button
                    type='button'
                    onClick={() => setRowPreview(null)}
                    className='rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100'
                  >
                    Cancelar
                  </button>
                  <button
                    type='button'
                    onClick={() => void handleConfirmRowAdjustment()}
                    disabled={submittingAdjustment}
                    className='rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60'
                  >
                    Confirmar cambios
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {canRenderPortal && bulkPreview?.length
        ? createPortal(
            <div
              className='fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4'
              onMouseDown={event => {
                if (event.target === event.currentTarget) {
                  setBulkPreview(null)
                }
              }}
            >
              <section
                role='dialog'
                aria-modal='true'
                aria-label='Previsualización de ajuste masivo'
                className='flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl'
              >
                <div className='flex items-start justify-between gap-3 border-b border-slate-200 pb-3'>
                  <div>
                    <h2 className='text-lg font-semibold text-slate-900'>Confirmar ajuste masivo</h2>
                    <p className='mt-1 text-sm text-slate-600'>{bulkPreview.length} producto(s) seleccionado(s)</p>
                  </div>
                  <button
                    type='button'
                    onClick={() => setBulkPreview(null)}
                    className='rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100'
                  >
                    Cerrar
                  </button>
                </div>

                <div className='mt-4 space-y-3 overflow-y-auto pr-1'>
                  {bulkPreview.map(preview => (
                    <article key={preview.itemId} className='rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700'>
                      <p className='font-semibold text-slate-900'>{preview.itemName}</p>
                      <p className='text-xs text-slate-600'>{preview.operationLabel}</p>
                      <ul className='mt-2 list-disc space-y-1 pl-5 text-xs'>
                        {preview.previewLines.map(line => (
                          <li key={`${preview.itemId}-${line}`}>{line}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>

                <div className='mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-3'>
                  <button
                    type='button'
                    onClick={() => setBulkPreview(null)}
                    className='rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100'
                  >
                    Cancelar
                  </button>
                  <button
                    type='button'
                    onClick={() => void handleConfirmBulkAdjustment()}
                    disabled={submittingAdjustment}
                    className='rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60'
                  >
                    Confirmar cambios masivos
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {toasts.length ? (
        <aside
          className='fixed right-4 top-4 z-[120] flex w-[min(360px,92vw)] flex-col gap-2'
          aria-live='polite'
          aria-relevant='additions text'
        >
          {toasts.map(toast => (
            <article
              key={toast.id}
              role='status'
              className={`rounded-lg border px-3 py-2 text-sm shadow-lg ${
                toast.kind === 'success'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : toast.kind === 'error'
                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                    : 'border-slate-300 bg-white text-slate-800'
              }`}
            >
              <div className='flex items-start justify-between gap-3'>
                <p>{toast.text}</p>
                <button
                  type='button'
                  onClick={() => dismissToast(toast.id)}
                  aria-label='Cerrar notificación'
                  className='rounded px-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                >
                  x
                </button>
              </div>
            </article>
          ))}
        </aside>
      ) : null}

      {canRenderPortal && isAddProductModalOpen
        ? createPortal(
            <div
              className='fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4'
              onMouseDown={event => {
                if (event.target === event.currentTarget) {
                  handleCloseAddProductModal()
                }
              }}
            >
              <section
                role='dialog'
                aria-modal='true'
                aria-labelledby='add-product-modal-title'
                className='w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl'
              >
                <div className='flex items-start justify-between gap-3 border-b border-slate-200 pb-3'>
                  <div>
                    <h2 id='add-product-modal-title' className='text-lg font-semibold text-slate-900'>
                      Agregar producto nuevo
                    </h2>
                    <p className='mt-1 text-sm text-slate-600'>
                      Captura SKU, nombre, categoría, stock, umbral, precio y pasillo opcional.
                    </p>
                  </div>
                  <button
                    type='button'
                    onClick={handleCloseAddProductModal}
                    aria-label='Cerrar modal de agregar producto'
                    className='rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100'
                  >
                    Cerrar
                  </button>
                </div>

                <div className='mt-4 grid gap-3'>
                  <label className='grid gap-1 text-sm font-medium text-slate-700'>
                    SKU
                    <input
                      value={addProductForm.sku}
                      onChange={event => setAddProductForm(current => ({ ...current, sku: event.target.value }))}
                      aria-label='SKU del producto'
                      className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
                      autoFocus
                    />
                  </label>
                  <label className='grid gap-1 text-sm font-medium text-slate-700'>
                    Nombre
                    <input
                      value={addProductForm.productName}
                      onChange={event => setAddProductForm(current => ({ ...current, productName: event.target.value }))}
                      aria-label='Nombre del producto'
                      className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
                    />
                  </label>
                  <label className='grid gap-1 text-sm font-medium text-slate-700'>
                    Categoría
                    <input
                      value={addProductForm.category}
                      onChange={event => setAddProductForm(current => ({ ...current, category: event.target.value }))}
                      aria-label='Categoría del producto'
                      className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
                    />
                  </label>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <label className='grid gap-1 text-sm font-medium text-slate-700'>
                      Stock
                      <input
                        value={addProductForm.stock}
                        onChange={event => setAddProductForm(current => ({ ...current, stock: event.target.value }))}
                        aria-label='Stock inicial'
                        inputMode='numeric'
                        className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
                      />
                    </label>
                    <label className='grid gap-1 text-sm font-medium text-slate-700'>
                      Precio
                      <input
                        value={addProductForm.unitPrice}
                        onChange={event => setAddProductForm(current => ({ ...current, unitPrice: event.target.value }))}
                        aria-label='Precio unitario'
                        inputMode='decimal'
                        className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
                      />
                    </label>
                  </div>
                  <label className='grid gap-1 text-sm font-medium text-slate-700'>
                    Umbral de stock bajo
                    <input
                      value={addProductForm.minStock}
                      onChange={event => setAddProductForm(current => ({ ...current, minStock: event.target.value }))}
                      aria-label='Umbral de stock bajo'
                      inputMode='numeric'
                      className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
                    />
                    <span className='text-xs font-normal text-slate-500'>
                      Alerta cuando el stock sea igual o menor a este valor. Para productos a peso usa kilogramos
                      (predeterminado {DEFAULT_MIN_STOCK} pz / {DEFAULT_MIN_STOCK} kg según el tipo).
                    </span>
                  </label>
                  <label className='grid gap-1 text-sm font-medium text-slate-700'>
                    Pasillo
                    <input
                      value={addProductForm.aisle}
                      onChange={event => setAddProductForm(current => ({ ...current, aisle: event.target.value }))}
                      aria-label='Pasillo del producto'
                      placeholder='Opcional'
                      className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
                    />
                  </label>
                </div>

                <div className='mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-3'>
                  <button
                    type='button'
                    onClick={handleCloseAddProductModal}
                    className='rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100'
                  >
                    Cancelar
                  </button>
                  <button
                    type='button'
                    onClick={() => void handleAddProduct()}
                    disabled={submittingAdjustment}
                    aria-label='Guardar producto nuevo'
                    className='rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60'
                  >
                    {submittingAdjustment ? 'Guardando...' : 'Agregar producto nuevo'}
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {isImportModalOpen ? (
        <div
          className='fixed inset-0 z-40 overflow-y-auto bg-slate-950/55 p-4'
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
            className='mx-auto my-6 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xl'
          >
            <div className='flex items-start justify-between gap-4 border-b border-slate-200 pb-4'>
              <div>
                <h2 id='inventory-import-title' className='text-lg font-semibold text-slate-950'>
                  Importación de productos
                </h2>
                <p className='mt-1 text-sm text-slate-600'>
                  Selecciona un CSV con columnas: sku, producto, categoria, unidad, precio, stock.
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

            <div className='mt-4 space-y-4 overflow-y-auto pr-1'>
              {importing ? (
                <p
                  role='status'
                  aria-live='polite'
                  className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700'
                >
                  Hay una importación en proceso. Espera a que termine para validar o importar otro archivo.
                </p>
              ) : null}
              <div className='grid gap-4'>
                <label className='grid gap-2 text-sm font-medium text-slate-700'>
                  Archivo CSV
                  <input
                    type='file'
                    accept='.csv,text/csv'
                    onChange={event => void handleImportFileChange(event)}
                    aria-label='Seleccionar archivo CSV de productos'
                    disabled={importing}
                    className='rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50'
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
                    rows={10}
                    disabled={importing}
                    aria-label='Contenido CSV de productos'
                    className='rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-50'
                  />
                </label>

                <div className='flex flex-wrap items-center gap-3'>
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
                <section className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
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
                  <div className='mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white'>
                    <table className='min-w-[720px] divide-y divide-slate-200'>
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
                  <div className='mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3'>
                    <p className='text-xs font-semibold uppercase tracking-wide text-amber-800'>Filas rechazadas</p>
                    <p className='mt-1 text-xs text-amber-800'>
                      {validationResult.errors.length} fila(s) con error. Líneas: {rejectedValidationLines.join(', ')}.
                    </p>
                    <ul className='mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-amber-700'>
                      {validationResult.errors.slice(0, 20).map(error => (
                        <li key={`${error.line}-${error.reason}`}>Línea {error.line}: {error.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className='mt-3 text-sm text-slate-700'>Sin errores de validación.</p>
                )}
                </section>
              ) : null}

              {importResult ? (
                <section className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
                {importResult.success && importResult.summary ? (
                  <>
                    <h3 className='text-sm font-semibold text-slate-900'>Resultado de importación</h3>
                    <p className='mt-1 text-sm text-slate-700'>
                      Creados: {importResult.summary.created} | Actualizados: {importResult.summary.updated} | Fallidos:{' '}
                      {importResult.summary.failed}
                    </p>
                    {importResult.errors?.length ? (
                      <div className='mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3'>
                        <p className='text-xs font-semibold uppercase tracking-wide text-amber-800'>Filas rechazadas</p>
                        <p className='mt-1 text-xs text-amber-800'>
                          {importResult.errors.length} fila(s) con error. Líneas: {rejectedImportLines.join(', ')}.
                        </p>
                        <ul className='mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700'>
                        {importResult.errors.slice(0, 20).map(error => (
                          <li key={`${error.line}-${error.reason}`}>Línea {error.line}: {error.reason}</li>
                        ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className='text-sm text-rose-700'>{importResult.message || 'Error en importación'}</p>
                )}
                </section>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
