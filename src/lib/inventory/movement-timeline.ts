export type MovementCategory = 'sales' | 'inventory'

export type MovementOperationType = 'sale.create' | 'inventory.import.csv'

export type MovementStatus = 'success' | 'failed' | 'pending' | string

export type SystemActionLogMovementRow = {
  id: string
  action: string
  status: MovementStatus
  actorUsername: string
  actorRole: string
  metadata: unknown
  createdAt: Date
}

export type MovementTimelineEntry = {
  id: string
  category: MovementCategory
  operationType: MovementOperationType
  operationLabel: string
  status: MovementStatus
  actorUsername: string
  actorRole: string
  createdAt: string
  details: string
}

type BuildMovementTimelineOptions = {
  operationType?: MovementOperationType | 'all'
}

type SupportedMovementRow = SystemActionLogMovementRow & {
  action: MovementOperationType
}

const movementOperationCatalog: Record<
  MovementOperationType,
  { category: MovementCategory; label: string; detailsFromMetadata: (metadata: unknown) => string }
> = {
  'sale.create': {
    category: 'sales',
    label: 'Venta registrada',
    detailsFromMetadata: metadata => {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return 'Registro de venta completado'
      }
      const values = metadata as Record<string, unknown>
      const saleNumber = typeof values.saleNumber === 'string' ? values.saleNumber : 'N/A'
      const paymentMethod = typeof values.paymentMethod === 'string' ? values.paymentMethod : 'N/A'
      const pieceCount = typeof values.pieceCount === 'number' ? values.pieceCount : null
      const weightGrams = typeof values.weightGrams === 'number' ? values.weightGrams : null
      if (pieceCount !== null && weightGrams !== null) {
        const parts: string[] = []
        if (pieceCount > 0) parts.push(`${pieceCount} pz`)
        if (weightGrams > 0) parts.push(`${(weightGrams / 1000).toFixed(3)} kg`)
        const quantityLabel = parts.length ? parts.join(' | ') : '0 pz'
        return `Venta ${saleNumber} | Pago: ${paymentMethod} | ${quantityLabel}`
      }
      const itemCount = typeof values.itemCount === 'number' ? values.itemCount : null
      return `Venta ${saleNumber} | Pago: ${paymentMethod}${itemCount === null ? '' : ` | Líneas: ${itemCount}`}`
    }
  },
  'inventory.import.csv': {
    category: 'inventory',
    label: 'Importación de inventario',
    detailsFromMetadata: metadata => {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return 'Importación ejecutada'
      }
      const values = metadata as Record<string, unknown>
      const created = typeof values.created === 'number' ? values.created : 0
      const updated = typeof values.updated === 'number' ? values.updated : 0
      const failed = typeof values.failed === 'number' ? values.failed : 0
      return `Creados: ${created} | Actualizados: ${updated} | Fallidos: ${failed}`
    }
  }
}

const isSupportedOperation = (action: string): action is MovementOperationType => action in movementOperationCatalog

export const getAvailableMovementOperationTypes = () => Object.keys(movementOperationCatalog) as MovementOperationType[]

export const buildMovementTimeline = (
  rows: SystemActionLogMovementRow[],
  options: BuildMovementTimelineOptions = {}
): MovementTimelineEntry[] => {
  const selectedOperation = options.operationType || 'all'

  return rows
    .filter((row): row is SupportedMovementRow => isSupportedOperation(row.action))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .flatMap(row => {
      const operationType: MovementOperationType = row.action
      if (selectedOperation !== 'all' && operationType !== selectedOperation) {
        return []
      }

      const definition = movementOperationCatalog[operationType]
      return [
        {
          id: row.id,
          category: definition.category,
          operationType,
          operationLabel: definition.label,
          status: row.status,
          actorUsername: row.actorUsername,
          actorRole: row.actorRole,
          createdAt: row.createdAt.toISOString(),
          details: definition.detailsFromMetadata(row.metadata)
        }
      ]
    })
}
