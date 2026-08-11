import {
  calculateBillableAmount,
  formatSaleQuantitySummary,
  formatStockQuantityLabel,
  formatUnitCostLabel,
  summarizeSaleQuantities,
  type SaleQuantityLine
} from '@/src/lib/inventory/logbook-quantity'
import { inferWeightSupport } from '@/src/lib/inventory/weight-units'

export type LogbookCategory = 'sales' | 'inventory' | 'pos' | 'crm' | 'system'

export type SystemActionLogRow = {
  id: string
  action: string
  status: string
  actorUsername: string
  actorRole: string
  entityType?: string
  entityId?: string
  metadata: unknown
  createdAt: Date
}

export type SystemLogbookEntry = {
  id: string
  action: string
  actionLabel: string
  category: LogbookCategory
  status: string
  actorUsername: string
  actorRole: string
  createdAt: string
  details: string
  entityType: string | null
  entityId: string | null
  saleId: string | null
  canViewTicket: boolean
}

type BuildSystemLogbookOptions = {
  category: LogbookCategory | 'all'
  weightSupportByItemId?: Map<string, boolean>
}

const actionLabelMap: Record<string, string> = {
  'sale.create': 'Venta completada',
  'inventory.import.csv': 'Importación de inventario',
  'pos.draft.saved': 'Borrador POS guardado',
  'inventory.product.create': 'Producto agregado',
  'inventory.product.delete': 'Producto eliminado',
  'inventory.price.correct': 'Precio corregido',
  'inventory.price.schedule': 'Precio programado',
  'inventory.movement.entry': 'Entrada manual de stock',
  'inventory.movement.exit': 'Salida manual de stock',
  'inventory.lot.waste': 'Merma por caducidad',
  'finance.purchase.entry': 'Compra a proveedor',
  'finance.supplier.create': 'Proveedor creado'
}

const deriveCategory = (action: string): LogbookCategory => {
  if (action.startsWith('sale.')) return 'sales'
  if (action.startsWith('inventory.')) return 'inventory'
  if (action.startsWith('finance.purchase')) return 'inventory'
  if (action.startsWith('pos.')) return 'pos'
  if (action.startsWith('crm.') || action.includes('approval') || action.includes('handoff')) return 'crm'
  return 'system'
}

const asRecord = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }
  return metadata as Record<string, unknown>
}

const formatMetadataFallback = (metadata: unknown) => {
  const values = asRecord(metadata)
  if (!values) return 'Sin detalle adicional'

  const entries = Object.entries(values)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .slice(0, 6)

  if (!entries.length) return 'Sin detalle adicional'
  return entries.join(' | ')
}

const readTicketLines = (metadata: Record<string, unknown>): SaleQuantityLine[] => {
  if (!Array.isArray(metadata.items)) return []
  return metadata.items.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const values = item as Record<string, unknown>
    const quantity = typeof values.quantity === 'number' ? values.quantity : null
    const unitMode = values.unitMode === 'weight' || values.unitMode === 'piece' ? values.unitMode : null
    if (quantity === null || unitMode === null) return []
    return [{ quantity, unitMode }]
  })
}

const resolveSaleQuantitySummary = (metadata: Record<string, unknown>) => {
  const pieceCount = typeof metadata.pieceCount === 'number' ? metadata.pieceCount : null
  const weightGrams = typeof metadata.weightGrams === 'number' ? metadata.weightGrams : null
  if (pieceCount !== null && weightGrams !== null) {
    return { pieceCount, weightGrams }
  }

  const ticketLines = readTicketLines(metadata)
  if (ticketLines.length) {
    return summarizeSaleQuantities(ticketLines)
  }

  return null
}

const buildSaleDetails = (metadata: unknown) => {
  const values = asRecord(metadata)
  if (!values) return 'Venta completada'

  const saleNumber = typeof values.saleNumber === 'string' ? values.saleNumber : 'N/A'
  const paymentMethod = typeof values.paymentMethod === 'string' ? values.paymentMethod : 'N/A'
  const saleStatus = typeof values.status === 'string' ? values.status : 'completed'
  const quantitySummary = resolveSaleQuantitySummary(values)
  const quantityLabel = quantitySummary
    ? formatSaleQuantitySummary(quantitySummary.pieceCount, quantitySummary.weightGrams)
    : null
  const itemCount = typeof values.itemCount === 'number' ? values.itemCount : null
  const fallbackLines =
    quantityLabel === null && itemCount !== null ? ` | Líneas: ${itemCount}` : quantityLabel ? ` | ${quantityLabel}` : ''

  return `Venta ${saleNumber} | Estado: ${saleStatus} | Pago: ${paymentMethod}${fallbackLines}`
}

const buildInventoryImportDetails = (metadata: unknown) => {
  const values = asRecord(metadata)
  if (!values) return 'Importación ejecutada'

  const created = typeof values.created === 'number' ? values.created : 0
  const updated = typeof values.updated === 'number' ? values.updated : 0
  const failed = typeof values.failed === 'number' ? values.failed : 0
  const base = `Creados: ${created} | Actualizados: ${updated} | Fallidos: ${failed}`

  const errors = Array.isArray(values.errors) ? values.errors : []
  const firstError = errors.find(
    (error): error is { line: number; reason: string } =>
      typeof error === 'object' &&
      error !== null &&
      'line' in error &&
      'reason' in error &&
      typeof (error as { line?: unknown }).line === 'number' &&
      typeof (error as { reason?: unknown }).reason === 'string'
  )

  if (!firstError) return base
  return `${base} | Línea ${firstError.line}: ${firstError.reason}`
}

const buildInventoryDeleteDetails = (metadata: unknown) => {
  const values = asRecord(metadata)
  if (!values) return 'Producto eliminado del catálogo'

  const mode = values.mode === 'archived' ? 'Archivado por historial de ventas' : 'Eliminado definitivamente'
  const reason = typeof values.reason === 'string' ? values.reason : 'Sin motivo'
  const linkedSalesCount = typeof values.linkedSalesCount === 'number' ? values.linkedSalesCount : 0
  const clearedStock = typeof values.clearedStock === 'number' ? values.clearedStock : 0
  const supportsWeight = typeof values.supportsWeight === 'boolean' ? values.supportsWeight : false
  return `${mode} | Stock liberado: ${formatStockQuantityLabel(clearedStock, supportsWeight)} | Ventas vinculadas: ${linkedSalesCount} | Motivo: ${reason}`
}

const buildInventoryPriceDetails = (metadata: unknown) => {
  const values = asRecord(metadata)
  if (!values) return 'Precio actualizado'

  const newUnitPrice = typeof values.newUnitPrice === 'number' ? values.newUnitPrice : null
  const reason = typeof values.reason === 'string' ? values.reason : 'Sin motivo'
  if (newUnitPrice === null) return `Precio actualizado | Motivo: ${reason}`
  return `Nuevo precio: ${newUnitPrice.toFixed(2)} MXN | Motivo: ${reason}`
}

const resolveSupportsWeight = (
  metadata: Record<string, unknown>,
  entityId: string | undefined,
  weightSupportByItemId?: Map<string, boolean>
) => {
  if (typeof metadata.supportsWeight === 'boolean') return metadata.supportsWeight
  if (metadata.unitMode === 'weight') return true
  if (metadata.unitMode === 'piece') return false
  if (typeof metadata.category === 'string') {
    return inferWeightSupport(
      metadata.category,
      typeof metadata.aisle === 'string' ? metadata.aisle : null,
      typeof metadata.productName === 'string' ? metadata.productName : ''
    )
  }
  const inventoryItemId =
    typeof metadata.inventoryItemId === 'string' ? metadata.inventoryItemId : entityId
  if (inventoryItemId && weightSupportByItemId?.has(inventoryItemId)) {
    return Boolean(weightSupportByItemId.get(inventoryItemId))
  }
  return false
}

const buildInventoryMovementEntryDetails = (
  metadata: unknown,
  entityId: string | undefined,
  weightSupportByItemId?: Map<string, boolean>
) => {
  const values = asRecord(metadata)
  if (!values) return 'Entrada registrada'

  const quantity = typeof values.quantity === 'number' ? values.quantity : null
  const unitCost = typeof values.unitCost === 'number' ? values.unitCost : null
  const nextUnitPrice = typeof values.nextUnitPrice === 'number' ? values.nextUnitPrice : null
  const reason = typeof values.reason === 'string' ? values.reason : 'Sin motivo'
  const supportsWeight = resolveSupportsWeight(values, entityId, weightSupportByItemId)
  const quantityLabel = quantity === null ? '?' : formatStockQuantityLabel(quantity, supportsWeight)
  const costLabel = unitCost === null ? '?' : formatUnitCostLabel(unitCost, supportsWeight)
  return `Entrada: +${quantityLabel} | Costo: ${costLabel} | Precio promedio: ${
    nextUnitPrice?.toFixed(2) ?? '?'
  } MXN | Motivo: ${reason}`
}

const buildInventoryMovementExitDetails = (
  metadata: unknown,
  entityId: string | undefined,
  weightSupportByItemId?: Map<string, boolean>
) => {
  const values = asRecord(metadata)
  if (!values) return 'Salida registrada'

  const quantity = typeof values.quantity === 'number' ? values.quantity : null
  const valuationMethod = values.valuationMethod === 'fifo' ? 'FIFO' : values.valuationMethod === 'average' ? 'Promedio' : 'N/A'
  const unitCost = typeof values.unitCost === 'number' ? values.unitCost : null
  const totalCost = typeof values.totalCost === 'number' ? values.totalCost : null
  const reason = typeof values.reason === 'string' ? values.reason : 'Sin motivo'
  const supportsWeight = resolveSupportsWeight(values, entityId, weightSupportByItemId)
  const quantityLabel = quantity === null ? '?' : formatStockQuantityLabel(quantity, supportsWeight)
  const costLabel = unitCost === null ? '?' : formatUnitCostLabel(unitCost, supportsWeight)
  return `Salida: -${quantityLabel} | Método: ${valuationMethod} | Costo unitario: ${costLabel} | Costo total: ${
    totalCost?.toFixed(2) ?? '?'
  } MXN | Motivo: ${reason}`
}

const buildPurchaseEntryDetails = (
  metadata: unknown,
  weightSupportByItemId?: Map<string, boolean>
) => {
  const values = asRecord(metadata)
  if (!values) return 'Compra a proveedor registrada'

  const sku = typeof values.sku === 'string' ? values.sku : null
  const productName = typeof values.productName === 'string' ? values.productName : null
  const supplierName = typeof values.supplierName === 'string' ? values.supplierName : null
  const quantity = typeof values.quantity === 'number' ? values.quantity : null
  const unitCost = typeof values.unitCost === 'number' ? values.unitCost : null
  const totalAmount = typeof values.totalAmount === 'number' ? values.totalAmount : null
  const paymentStatus = values.paymentStatus === 'credit' ? 'Crédito' : values.paymentStatus === 'paid' ? 'Contado' : null
  const expiresOn = typeof values.expiresOn === 'string' ? values.expiresOn : null
  const inventoryItemId = typeof values.inventoryItemId === 'string' ? values.inventoryItemId : undefined
  const supportsWeight = resolveSupportsWeight(values, inventoryItemId, weightSupportByItemId)
  const quantityLabel = quantity === null ? '?' : formatStockQuantityLabel(quantity, supportsWeight)
  const costLabel = unitCost === null ? '?' : formatUnitCostLabel(unitCost, supportsWeight)
  let displayTotal = totalAmount
  if (quantity !== null && unitCost !== null) {
    const billableTotal = calculateBillableAmount(quantity, unitCost, supportsWeight)
    const rawStoredTotal = Number((quantity * unitCost).toFixed(2))
    // Historical weight purchases may store grams×$/kg; prefer billable kg×$/kg when that pattern matches.
    if (
      supportsWeight &&
      totalAmount !== null &&
      Math.abs(totalAmount - rawStoredTotal) <= 0.05 &&
      Math.abs(totalAmount - billableTotal) > 0.05
    ) {
      displayTotal = billableTotal
    } else if (totalAmount === null) {
      displayTotal = billableTotal
    }
  }
  const productLabel = [sku, productName].filter(Boolean).join(' · ') || 'Producto'
  const parts = [
    productLabel,
    `Cantidad: ${quantityLabel}`,
    `Costo: ${costLabel}`,
    `Total: ${displayTotal?.toFixed(2) ?? '?'} MXN`
  ]
  if (supplierName) parts.push(`Proveedor: ${supplierName}`)
  if (paymentStatus) parts.push(`Pago: ${paymentStatus}`)
  if (expiresOn) parts.push(`Caduca: ${expiresOn}`)
  return parts.join(' | ')
}

const buildLotWasteDetails = (
  metadata: unknown,
  entityId: string | undefined,
  weightSupportByItemId?: Map<string, boolean>
) => {
  const values = asRecord(metadata)
  if (!values) return 'Merma de lote registrada'

  const sku = typeof values.sku === 'string' ? values.sku : null
  const productName = typeof values.productName === 'string' ? values.productName : null
  const quantity = typeof values.quantity === 'number' ? values.quantity : null
  const remaining = typeof values.remaining === 'number' ? values.remaining : null
  const reason = typeof values.reason === 'string' ? values.reason : 'Merma por caducidad'
  const inventoryItemId = typeof values.inventoryItemId === 'string' ? values.inventoryItemId : entityId
  const supportsWeight = resolveSupportsWeight(values, inventoryItemId, weightSupportByItemId)
  const quantityLabel = quantity === null ? '?' : formatStockQuantityLabel(quantity, supportsWeight)
  const remainingLabel = remaining === null ? '?' : formatStockQuantityLabel(remaining, supportsWeight)
  const productLabel = [sku, productName].filter(Boolean).join(' · ')
  const prefix = productLabel ? `${productLabel} | ` : ''
  return `${prefix}Merma: -${quantityLabel} | Restante del lote: ${remainingLabel} | Motivo: ${reason}`
}

const buildPosDraftDetails = (metadata: unknown) => {
  const values = asRecord(metadata)
  if (!values) return 'Borrador de caja actualizado'

  const cart = Array.isArray(values.cart) ? values.cart : []
  const paymentMethod = typeof values.paymentMethod === 'string' ? values.paymentMethod : 'N/A'
  return `Carrito: ${cart.length} item(s) | Pago: ${paymentMethod}`
}

const buildInventoryCreateDetails = (metadata: unknown) => {
  const values = asRecord(metadata)
  if (!values) return 'Producto agregado'

  const sku = typeof values.sku === 'string' ? values.sku : 'N/A'
  const productName = typeof values.productName === 'string' ? values.productName : 'N/A'
  const stock = typeof values.stock === 'number' ? values.stock : 0
  const unitPrice = typeof values.unitPrice === 'number' ? values.unitPrice : null
  const supportsWeight = resolveSupportsWeight(values, undefined)
  return `${sku} | ${productName} | Stock inicial: ${formatStockQuantityLabel(stock, supportsWeight)} | Precio: ${
    unitPrice?.toFixed(2) ?? '?'
  } MXN`
}

const resolveSaleId = (row: SystemActionLogRow) => {
  const values = asRecord(row.metadata)
  if (values && typeof values.saleId === 'string') return values.saleId
  if (row.entityType === 'Sale' && typeof row.entityId === 'string') return row.entityId
  return null
}

const buildDetails = (
  action: string,
  metadata: unknown,
  entityId: string | undefined,
  weightSupportByItemId?: Map<string, boolean>
) => {
  if (action === 'sale.create') return buildSaleDetails(metadata)
  if (action === 'inventory.import.csv') return buildInventoryImportDetails(metadata)
  if (action === 'inventory.product.delete') return buildInventoryDeleteDetails(metadata)
  if (action === 'inventory.price.correct' || action === 'inventory.price.schedule') return buildInventoryPriceDetails(metadata)
  if (action === 'inventory.movement.entry') {
    return buildInventoryMovementEntryDetails(metadata, entityId, weightSupportByItemId)
  }
  if (action === 'inventory.movement.exit') {
    return buildInventoryMovementExitDetails(metadata, entityId, weightSupportByItemId)
  }
  if (action === 'finance.purchase.entry') {
    return buildPurchaseEntryDetails(metadata, weightSupportByItemId)
  }
  if (action === 'inventory.lot.waste') {
    return buildLotWasteDetails(metadata, entityId, weightSupportByItemId)
  }
  if (action === 'pos.draft.saved') return buildPosDraftDetails(metadata)
  if (action === 'inventory.product.create') return buildInventoryCreateDetails(metadata)
  return formatMetadataFallback(metadata)
}

export const buildSystemLogbookEntries = (
  rows: SystemActionLogRow[],
  options: BuildSystemLogbookOptions
): SystemLogbookEntry[] => {
  return rows
    .map<SystemLogbookEntry>(row => {
      const category = deriveCategory(row.action)
      const saleId = row.action === 'sale.create' ? resolveSaleId(row) : null
      return {
        id: row.id,
        action: row.action,
        actionLabel: actionLabelMap[row.action] || row.action,
        category,
        status: row.status,
        actorUsername: row.actorUsername,
        actorRole: row.actorRole,
        createdAt: row.createdAt.toISOString(),
        details: buildDetails(row.action, row.metadata, row.entityId, options.weightSupportByItemId),
        entityType: row.entityType || null,
        entityId: row.entityId || null,
        saleId,
        canViewTicket: row.action === 'sale.create' && Boolean(saleId)
      }
    })
    .filter(entry => options.category === 'all' || entry.category === options.category)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}
