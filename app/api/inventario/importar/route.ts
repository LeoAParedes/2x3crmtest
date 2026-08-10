import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const importPayloadSchema = z.object({
  csv: z.string().min(1),
  validateOnly: z.boolean().optional()
})

type ParsedRow = {
  sku: string
  productName: string
  category: string
  stock: number
  unitPrice: number
  aisle: string | null
}

const PREVIEW_ROW_LIMIT = 12

const logInventoryImportDebug = (runId: string, hypothesisId: string, message: string, data: Record<string, unknown>) => {
  // #region agent log
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify({
      sessionId: '449600',
      runId,
      hypothesisId,
      location: 'app/api/inventario/importar/route.ts',
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion
}

const parseNumber = (value: string) => Number(value.replace(',', '.').trim())

const spanishHeaders = ['sku', 'producto', 'categoria', 'unidad', 'precio', 'stock'] as const
const legacyHeaders = ['sku', 'productName', 'category', 'stock', 'unitPrice'] as const
const weightedUnitValues = new Set(['kg', 'g', 'gramo', 'gramos'])

type HeaderConfig = {
  sku: string
  productName: string
  category: string
  stock: string
  unitPrice: string
  unit?: string
  aisle?: string
}

const resolveHeaderConfig = (header: string[]): HeaderConfig => {
  const hasSpanishHeaders = spanishHeaders.every(column => header.includes(column))
  if (hasSpanishHeaders) {
    return {
      sku: 'sku',
      productName: 'producto',
      category: 'categoria',
      stock: 'stock',
      unitPrice: 'precio',
      unit: 'unidad'
    }
  }

  const hasLegacyHeaders = legacyHeaders.every(column => header.includes(column))
  if (hasLegacyHeaders) {
    return {
      sku: 'sku',
      productName: 'productName',
      category: 'category',
      stock: 'stock',
      unitPrice: 'unitPrice',
      aisle: 'aisle'
    }
  }

  throw new Error(`CSV_HEADERS_MISSING:${spanishHeaders.join(',')}`)
}

const buildAisleHint = (unitRaw: string, aisleRaw: string) => {
  if (aisleRaw) return aisleRaw

  const normalizedUnit = unitRaw.trim().toLowerCase()
  if (weightedUnitValues.has(normalizedUnit)) {
    return 'Granel (kg)'
  }

  return null
}

export const parseCsvRows = (csv: string) => {
  const lines = csv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    throw new Error('CSV_EMPTY')
  }

  const header = lines[0].split(',').map(item => item.trim())
  const config = resolveHeaderConfig(header)

  const mapIndex = (column: string) => header.indexOf(column)
  const parsedRows: ParsedRow[] = []
  const errors: Array<{ line: number; reason: string }> = []

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const row = lines[lineIndex].split(',').map(item => item.trim())
    const sku = row[mapIndex(config.sku)] || ''
    const productName = row[mapIndex(config.productName)] || ''
    const category = row[mapIndex(config.category)] || ''
    const stockRaw = row[mapIndex(config.stock)] || ''
    const unitPriceRaw = row[mapIndex(config.unitPrice)] || ''
    const unitRaw = config.unit ? row[mapIndex(config.unit)] || '' : ''
    const aisleRaw = config.aisle ? row[mapIndex(config.aisle)] || '' : ''

    if (!sku || !productName || !category || (config.unit && !unitRaw)) {
      errors.push({ line: lineIndex + 1, reason: 'Campos obligatorios vacíos' })
      continue
    }

    const stock = parseNumber(stockRaw)
    const unitPrice = parseNumber(unitPriceRaw)
    if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      errors.push({ line: lineIndex + 1, reason: 'Stock o precio inválido (debe ser numérico y >= 0)' })
      continue
    }

    parsedRows.push({
      sku,
      productName,
      category,
      stock: Math.round(stock),
      unitPrice: Number(unitPrice.toFixed(2)),
      aisle: buildAisleHint(unitRaw, aisleRaw)
    })
  }

  return { parsedRows, errors }
}

export const buildImportValidationPreview = (csv: string) => {
  const { parsedRows, errors } = parseCsvRows(csv)
  const previewRows = parsedRows.slice(0, PREVIEW_ROW_LIMIT)
  const canImport = parsedRows.length > 0

  return {
    canImport,
    message: canImport ? null : 'No hay filas válidas para importar. Corrige los errores y vuelve a validar.',
    preview: {
      rows: previewRows,
      shownRows: previewRows.length,
      totalValidRows: parsedRows.length,
      limit: PREVIEW_ROW_LIMIT
    },
    errors
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  try {
    const runId = `import-api-${Date.now()}`
    const payload = importPayloadSchema.parse(await request.json())
    logInventoryImportDebug(runId, 'H1', 'import payload parsed', {
      validateOnly: Boolean(payload.validateOnly),
      csvLength: payload.csv.length
    })
    const validation = buildImportValidationPreview(payload.csv)
    // #region agent log
    console.info('[H1] import validation summary', {
      runId,
      validateOnly: Boolean(payload.validateOnly),
      canImport: validation.canImport,
      validRows: validation.preview.totalValidRows,
      previewRows: validation.preview.shownRows,
      errorsCount: validation.errors.length,
      firstErrors: validation.errors.slice(0, 3)
    })
    // #endregion
    logInventoryImportDebug(runId, 'H1', 'import validation summary', {
      canImport: validation.canImport,
      validRows: validation.preview.totalValidRows,
      previewRows: validation.preview.shownRows,
      errorsCount: validation.errors.length,
      firstErrors: validation.errors.slice(0, 3)
    })
    if (payload.validateOnly) {
      return jsonOk({
        success: true,
        validateOnly: true,
        canImport: validation.canImport,
        message: validation.message,
        preview: validation.preview,
        errors: validation.errors
      })
    }

    const { parsedRows, errors } = parseCsvRows(payload.csv)
    const prisma = await getPrisma()

    let created = 0
    let updated = 0

    for (const row of parsedRows) {
      const existing = await prisma.inventoryItem.findUnique({ where: { sku: row.sku } })
      if (existing) {
        await prisma.inventoryItem.update({
          where: { sku: row.sku },
          data: {
            productName: row.productName,
            category: row.category,
            stock: row.stock,
            unitPrice: row.unitPrice,
            aisle: row.aisle
          }
        })
        updated += 1
      } else {
        await prisma.inventoryItem.create({
          data: {
            sku: row.sku,
            productName: row.productName,
            category: row.category,
            stock: row.stock,
            unitPrice: row.unitPrice,
            aisle: row.aisle
          }
        })
        created += 1
      }
    }

    await prisma.systemActionLog.create({
      data: {
        actorAuthUserId: access.context.actor.userId,
        actorUsername: access.context.actor.username,
        actorRole: access.context.actor.role,
        action: 'inventory.import.csv',
        entityType: 'InventoryItem',
        entityId: 'bulk',
        status: 'success',
        metadata: {
          created,
          updated,
          failed: errors.length,
          errors: errors.slice(0, 20)
        }
      }
    })

    return jsonOk({
      success: true,
      summary: {
        created,
        updated,
        failed: errors.length
      },
      errors
    })
  } catch (error) {
    // #region agent log
    console.error('[H2] import route failed', {
      name: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : 'unknown'
    })
    // #endregion
    const message =
      error instanceof Error && error.message.startsWith('CSV_HEADERS_MISSING:')
        ? `Cabecera CSV inválida. Usa exactamente: ${error.message.replace('CSV_HEADERS_MISSING:', '')}`
        : error instanceof Error && error.message === 'CSV_EMPTY'
          ? 'El CSV debe incluir cabecera y al menos una fila de datos'
          : 'No fue posible importar productos'

    return jsonError(message, 400, {
      code: 'INVENTORY_IMPORT_INVALID',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.ok ? access.context.requestId : undefined
    })
  }
}
