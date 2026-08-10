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

  const raw = JSON.stringify(metadata)
  if (raw.length <= 220) return raw
  return `${raw.slice(0, 217)}...`
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

const buildDetails = (action: string, metadata: unknown) => {
  if (action === 'sale.create') return buildSaleDetails(metadata)
  if (action === 'inventory.import.csv') return buildInventoryImportDetails(metadata)
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
