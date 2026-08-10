export type LogbookCategory = 'sales' | 'inventory' | 'pos' | 'crm' | 'system'

export type SystemActionLogRow = {
  id: string
  action: string
  status: string
  actorUsername: string
  actorRole: string
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
}

type BuildSystemLogbookOptions = {
  category: LogbookCategory | 'all'
}

const actionLabelMap: Record<string, string> = {
  'sale.create': 'Venta registrada',
  'inventory.import.csv': 'Importación de inventario',
  'pos.draft.saved': 'Borrador POS guardado',
  'inventory.product.create': 'Producto agregado',
  'inventory.product.delete': 'Producto eliminado',
  'inventory.price.correct': 'Precio corregido',
  'inventory.price.schedule': 'Precio programado',
  'inventory.movement.entry': 'Entrada manual de stock',
  'inventory.movement.exit': 'Salida manual de stock'
}

const deriveCategory = (action: string): LogbookCategory => {
  if (action.startsWith('sale.')) return 'sales'
  if (action.startsWith('inventory.')) return 'inventory'
  if (action.startsWith('pos.')) return 'pos'
  if (action.startsWith('crm.') || action.includes('approval') || action.includes('handoff')) return 'crm'
  return 'system'
}

const formatMetadataFallback = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Sin detalle adicional'
  }

  const values = metadata as Record<string, unknown>
  const entries = Object.entries(values)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .slice(0, 6)

  if (!entries.length) return 'Sin detalle adicional'
  return entries.join(' | ')
}

const buildSaleDetails = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Venta registrada'
  }
  const values = metadata as Record<string, unknown>
  const saleNumber = typeof values.saleNumber === 'string' ? values.saleNumber : 'N/A'
  const paymentMethod = typeof values.paymentMethod === 'string' ? values.paymentMethod : 'N/A'
  const itemCount = typeof values.itemCount === 'number' ? values.itemCount : null
  return `Venta ${saleNumber} | Pago: ${paymentMethod}${itemCount === null ? '' : ` | Ítems: ${itemCount}`}`
}

const buildInventoryImportDetails = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Importación ejecutada'
  }
  const values = metadata as Record<string, unknown>
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
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Producto eliminado del catálogo'
  }
  const values = metadata as Record<string, unknown>
  const mode = values.mode === 'archived' ? 'Archivado por historial de ventas' : 'Eliminado definitivamente'
  const reason = typeof values.reason === 'string' ? values.reason : 'Sin motivo'
  const linkedSalesCount = typeof values.linkedSalesCount === 'number' ? values.linkedSalesCount : 0
  const clearedStock = typeof values.clearedStock === 'number' ? values.clearedStock : 0
  return `${mode} | Stock liberado: ${clearedStock} | Ventas vinculadas: ${linkedSalesCount} | Motivo: ${reason}`
}

const buildInventoryPriceDetails = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Precio actualizado'
  }
  const values = metadata as Record<string, unknown>
  const newUnitPrice = typeof values.newUnitPrice === 'number' ? values.newUnitPrice : null
  const reason = typeof values.reason === 'string' ? values.reason : 'Sin motivo'
  if (newUnitPrice === null) return `Precio actualizado | Motivo: ${reason}`
  return `Nuevo precio: ${newUnitPrice.toFixed(2)} MXN | Motivo: ${reason}`
}

const buildInventoryMovementEntryDetails = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Entrada registrada'
  }
  const values = metadata as Record<string, unknown>
  const quantity = typeof values.quantity === 'number' ? values.quantity : null
  const unitCost = typeof values.unitCost === 'number' ? values.unitCost : null
  const nextUnitPrice = typeof values.nextUnitPrice === 'number' ? values.nextUnitPrice : null
  const reason = typeof values.reason === 'string' ? values.reason : 'Sin motivo'
  return `Entrada: +${quantity ?? '?'} | Costo: ${unitCost?.toFixed(2) ?? '?'} MXN | Precio promedio: ${
    nextUnitPrice?.toFixed(2) ?? '?'
  } MXN | Motivo: ${reason}`
}

const buildInventoryMovementExitDetails = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Salida registrada'
  }
  const values = metadata as Record<string, unknown>
  const quantity = typeof values.quantity === 'number' ? values.quantity : null
  const valuationMethod = values.valuationMethod === 'fifo' ? 'FIFO' : values.valuationMethod === 'average' ? 'Promedio' : 'N/A'
  const unitCost = typeof values.unitCost === 'number' ? values.unitCost : null
  const totalCost = typeof values.totalCost === 'number' ? values.totalCost : null
  const reason = typeof values.reason === 'string' ? values.reason : 'Sin motivo'
  return `Salida: -${quantity ?? '?'} | Método: ${valuationMethod} | Costo unitario: ${
    unitCost?.toFixed(2) ?? '?'
  } MXN | Costo total: ${totalCost?.toFixed(2) ?? '?'} MXN | Motivo: ${reason}`
}

const buildPosDraftDetails = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Borrador de caja actualizado'
  }
  const values = metadata as Record<string, unknown>
  const cart = Array.isArray(values.cart) ? values.cart : []
  const paymentMethod = typeof values.paymentMethod === 'string' ? values.paymentMethod : 'N/A'
  return `Carrito: ${cart.length} item(s) | Pago: ${paymentMethod}`
}

const buildInventoryCreateDetails = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'Producto agregado'
  }
  const values = metadata as Record<string, unknown>
  const sku = typeof values.sku === 'string' ? values.sku : 'N/A'
  const productName = typeof values.productName === 'string' ? values.productName : 'N/A'
  const stock = typeof values.stock === 'number' ? values.stock : 0
  const unitPrice = typeof values.unitPrice === 'number' ? values.unitPrice : null
  return `${sku} | ${productName} | Stock inicial: ${stock} | Precio: ${unitPrice?.toFixed(2) ?? '?'} MXN`
}

const buildDetails = (action: string, metadata: unknown) => {
  if (action === 'sale.create') return buildSaleDetails(metadata)
  if (action === 'inventory.import.csv') return buildInventoryImportDetails(metadata)
  if (action === 'inventory.product.delete') return buildInventoryDeleteDetails(metadata)
  if (action === 'inventory.price.correct' || action === 'inventory.price.schedule') return buildInventoryPriceDetails(metadata)
  if (action === 'inventory.movement.entry') return buildInventoryMovementEntryDetails(metadata)
  if (action === 'inventory.movement.exit') return buildInventoryMovementExitDetails(metadata)
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
      return {
        id: row.id,
        action: row.action,
        actionLabel: actionLabelMap[row.action] || row.action,
        category,
        status: row.status,
        actorUsername: row.actorUsername,
        actorRole: row.actorRole,
        createdAt: row.createdAt.toISOString(),
        details: buildDetails(row.action, row.metadata)
      }
    })
    .filter(entry => options.category === 'all' || entry.category === options.category)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}
