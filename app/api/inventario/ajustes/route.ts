import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { applyDueScheduledPrices } from '@/src/lib/inventory/scheduled-prices'
import { buildFifoLotsFromMovements, calculateWeightedAveragePrice, consumeFifoLots } from '@/src/lib/inventory/valuation'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const addProductSchema = z.object({
  operation: z.literal('add_product'),
  sku: z.string().min(1).max(64),
  productName: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  stock: z.number().int().min(0).max(10_000_000),
  minStock: z.number().int().min(0).max(10_000_000).optional(),
  unitPrice: z.number().positive().max(10_000_000),
  aisle: z.string().max(120).nullable().optional()
})

const setMinStockSchema = z.object({
  operation: z.literal('set_min_stock'),
  inventoryItemId: z.string().cuid(),
  minStock: z.number().int().min(0).max(10_000_000),
  reason: z.string().min(3).max(240)
})

const deleteProductSchema = z.object({
  operation: z.literal('delete_product'),
  inventoryItemId: z.string().cuid(),
  reason: z.string().min(3).max(240)
})

const correctPriceSchema = z.object({
  operation: z.literal('correct_price'),
  inventoryItemId: z.string().cuid(),
  newUnitPrice: z.number().positive().max(10_000_000),
  reason: z.string().min(3).max(240)
})

const schedulePriceSchema = z.object({
  operation: z.literal('schedule_price'),
  inventoryItemId: z.string().cuid(),
  newUnitPrice: z.number().positive().max(10_000_000),
  effectiveFrom: z.string().datetime({ offset: true }),
  reason: z.string().min(3).max(240)
})

const stockEntrySchema = z.object({
  operation: z.literal('stock_entry'),
  inventoryItemId: z.string().cuid(),
  quantity: z.number().int().positive().max(10_000_000),
  unitCost: z.number().positive().max(10_000_000),
  reason: z.string().min(3).max(240)
})

const stockExitSchema = z.object({
  operation: z.literal('stock_exit'),
  inventoryItemId: z.string().cuid(),
  quantity: z.number().int().positive().max(10_000_000),
  valuationMethod: z.enum(['fifo', 'average']),
  reason: z.string().min(3).max(240)
})

const adjustmentPayloadSchema = z.union([
  addProductSchema,
  setMinStockSchema,
  deleteProductSchema,
  correctPriceSchema,
  schedulePriceSchema,
  stockEntrySchema,
  stockExitSchema
])

const parseMovementMetadata = (reason: string | null) => {
  if (!reason) return null
  try {
    const parsed = JSON.parse(reason) as Record<string, unknown>
    return parsed
  } catch {
    return null
  }
}

const logInventoryAdjustmentDebug = (runId: string, hypothesisId: string, message: string, data: Record<string, unknown>) => {
  // #region agent log
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify({
      sessionId: '449600',
      runId,
      hypothesisId,
      location: 'app/api/inventario/ajustes/route.ts',
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion
}

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) return access.response

  try {
    const prisma = await getPrisma()
    await applyDueScheduledPrices(prisma)

    const [pendingSchedules, latestMovements] = await Promise.all([
      prisma.systemActionLog.findMany({
        where: {
          action: 'inventory.price.schedule',
          status: 'pending'
        },
        orderBy: { createdAt: 'asc' },
        take: 100
      }),
      prisma.inventoryMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 120,
        include: {
          inventoryItem: {
            select: {
              sku: true,
              productName: true
            }
          }
        }
      })
    ])

    return jsonOk({
      success: true,
      schedules: pendingSchedules.map(schedule => ({
        id: schedule.id,
        inventoryItemId: schedule.entityId,
        status: schedule.status,
        metadata: schedule.metadata,
        createdAt: schedule.createdAt.toISOString()
      })),
      movements: latestMovements.map(movement => ({
        id: movement.id,
        inventoryItemId: movement.inventoryItemId,
        sku: movement.inventoryItem.sku,
        productName: movement.inventoryItem.productName,
        movementType: movement.movementType,
        quantity: movement.quantity,
        reason: movement.reason,
        createdAt: movement.createdAt.toISOString()
      }))
    })
  } catch (error) {
    return jsonError('No fue posible cargar ajustes de inventario', 503, {
      code: 'INVENTORY_ADJUSTMENTS_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) return access.response

  try {
    const runId = `delete-api-${Date.now()}`
    const rawBody = await request.text()
    let requestBody: unknown = null
    try {
      requestBody = JSON.parse(rawBody)
    } catch {
      // #region agent log
      console.error('[H7] inventory adjustment invalid json body', {
        runId,
        bodyLength: rawBody.length
      })
      // #endregion
      throw new Error('INVALID_JSON_BODY')
    }

    const parsedPayload = adjustmentPayloadSchema.safeParse(requestBody)
    if (!parsedPayload.success) {
      // #region agent log
      console.error('[H7] inventory adjustment payload validation failed', {
        runId,
        operation: typeof requestBody === 'object' && requestBody && 'operation' in requestBody ? requestBody.operation : null,
        issues: parsedPayload.error.issues.map(issue => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message
        }))
      })
      // #endregion
      throw new Error('ADJUSTMENT_PAYLOAD_INVALID')
    }

    const payload = parsedPayload.data
    // #region agent log
    console.info('[H8] inventory adjustment payload accepted', {
      runId,
      operation: payload.operation
    })
    // #endregion
    const prisma = await getPrisma()
    await applyDueScheduledPrices(prisma)

    if (payload.operation === 'add_product') {
      const created = await prisma.$transaction(async transaction => {
        const item = await transaction.inventoryItem.create({
          data: {
            sku: payload.sku,
            productName: payload.productName,
            category: payload.category,
            stock: payload.stock,
            minStock: payload.minStock ?? 20,
            unitPrice: payload.unitPrice,
            aisle: payload.aisle || null
          }
        })

        if (payload.stock > 0) {
          await transaction.inventoryMovement.create({
            data: {
              inventoryItemId: item.id,
              movementType: 'entry',
              quantity: payload.stock,
              reason: JSON.stringify({
                reason: 'Alta de producto con stock inicial',
                unitCost: payload.unitPrice,
                source: 'manual'
              })
            }
          })
        }

        await transaction.systemActionLog.create({
          data: {
            actorAuthUserId: access.context.actor.userId,
            actorUsername: access.context.actor.username,
            actorRole: access.context.actor.role,
            action: 'inventory.product.create',
            entityType: 'InventoryItem',
            entityId: item.id,
            status: 'success',
            metadata: payload
          }
        })

        return item
      })

      return jsonOk({
        success: true,
        message: 'Producto agregado correctamente',
        item: {
          id: created.id,
          sku: created.sku,
          productName: created.productName,
          category: created.category,
          stock: created.stock,
          minStock: created.minStock,
          unitPrice: Number(created.unitPrice)
        }
      })
    }

    if (payload.operation === 'set_min_stock') {
      const updated = await prisma.$transaction(async transaction => {
        const existing = await transaction.inventoryItem.findUnique({
          where: { id: payload.inventoryItemId }
        })
        if (!existing) throw new Error('INVENTORY_ITEM_NOT_FOUND')

        const item = await transaction.inventoryItem.update({
          where: { id: payload.inventoryItemId },
          data: { minStock: payload.minStock }
        })

        await transaction.systemActionLog.create({
          data: {
            actorAuthUserId: access.context.actor.userId,
            actorUsername: access.context.actor.username,
            actorRole: access.context.actor.role,
            action: 'inventory.min_stock.update',
            entityType: 'InventoryItem',
            entityId: item.id,
            status: 'success',
            metadata: {
              previousMinStock: existing.minStock,
              minStock: payload.minStock,
              reason: payload.reason
            }
          }
        })

        return item
      })

      return jsonOk({
        success: true,
        message: 'Umbral de stock bajo actualizado',
        item: {
          id: updated.id,
          sku: updated.sku,
          productName: updated.productName,
          category: updated.category,
          stock: updated.stock,
          minStock: updated.minStock,
          unitPrice: Number(updated.unitPrice)
        }
      })
    }

    if (payload.operation === 'delete_product') {
      logInventoryAdjustmentDebug(runId, 'H4', 'delete operation received', {
        inventoryItemId: payload.inventoryItemId
      })
      const deleteResult = await prisma.$transaction(async transaction => {
        const item = await transaction.inventoryItem.findUnique({
          where: { id: payload.inventoryItemId }
        })
        if (!item) throw new Error('INVENTORY_ITEM_NOT_FOUND')
        logInventoryAdjustmentDebug(runId, 'H5', 'delete target item loaded', {
          inventoryItemId: item.id,
          stock: item.stock
        })

        const linkedSalesCount = await transaction.saleItem.count({
          where: { inventoryItemId: payload.inventoryItemId }
        })

        if (item.stock > 0) {
          const unitCost = Number(item.unitPrice)
          const totalCost = Number((unitCost * item.stock).toFixed(2))

          await transaction.inventoryMovement.create({
            data: {
              inventoryItemId: payload.inventoryItemId,
              movementType: 'exit',
              quantity: -item.stock,
              reason: JSON.stringify({
                reason: `Salida automática previa a eliminación: ${payload.reason}`,
                valuationMethod: 'average',
                unitCost,
                totalCost,
                source: 'delete_product'
              })
            }
          })

          await transaction.systemActionLog.create({
            data: {
              actorAuthUserId: access.context.actor.userId,
              actorUsername: access.context.actor.username,
              actorRole: access.context.actor.role,
              action: 'inventory.movement.exit',
              entityType: 'InventoryItem',
              entityId: payload.inventoryItemId,
              status: 'success',
              metadata: {
                quantity: item.stock,
                valuationMethod: 'average',
                unitCost,
                totalCost,
                reason: `Salida automática previa a eliminación: ${payload.reason}`,
                automatic: true
              }
            }
          })
        }

        if (linkedSalesCount > 0) {
          const archivedSuffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
          await transaction.inventoryItem.update({
            where: { id: payload.inventoryItemId },
            data: {
              sku: `${item.sku}-archived-${archivedSuffix}`,
              productName: `${item.productName} [Archivado]`,
              stock: 0,
              aisle: '__archived__'
            }
          })
          logInventoryAdjustmentDebug(runId, 'H6', 'delete converted to archive due to sale links', {
            inventoryItemId: payload.inventoryItemId,
            linkedSalesCount
          })
        } else {
          await transaction.inventoryItem.delete({
            where: { id: payload.inventoryItemId }
          })
          logInventoryAdjustmentDebug(runId, 'H6', 'delete transaction removed inventory item', {
            inventoryItemId: payload.inventoryItemId
          })
        }

        await transaction.systemActionLog.create({
          data: {
            actorAuthUserId: access.context.actor.userId,
            actorUsername: access.context.actor.username,
            actorRole: access.context.actor.role,
            action: 'inventory.product.delete',
            entityType: 'InventoryItem',
            entityId: payload.inventoryItemId,
            status: 'success',
            metadata: {
              reason: payload.reason,
              clearedStock: item.stock,
              mode: linkedSalesCount > 0 ? 'archived' : 'deleted',
              linkedSalesCount
            }
          }
        })

        return {
          deletedStock: item.stock,
          mode: linkedSalesCount > 0 ? 'archived' : 'deleted',
          linkedSalesCount
        }
      })

      return jsonOk({
        success: true,
        message:
          deleteResult.mode === 'archived'
            ? `Producto archivado por historial de ventas (${deleteResult.linkedSalesCount} registros). Ya no aparece en inventario activo.`
            : deleteResult.deletedStock > 0
              ? `Producto eliminado. Se registró salida automática de ${deleteResult.deletedStock} unidad(es) antes de eliminarlo.`
              : 'Producto eliminado del catálogo correctamente.'
      })
    }

    if (payload.operation === 'correct_price') {
      const updated = await prisma.$transaction(async transaction => {
        const item = await transaction.inventoryItem.update({
          where: { id: payload.inventoryItemId },
          data: { unitPrice: payload.newUnitPrice }
        })

        await transaction.systemActionLog.create({
          data: {
            actorAuthUserId: access.context.actor.userId,
            actorUsername: access.context.actor.username,
            actorRole: access.context.actor.role,
            action: 'inventory.price.correct',
            entityType: 'InventoryItem',
            entityId: payload.inventoryItemId,
            status: 'success',
            metadata: payload
          }
        })

        return item
      })

      return jsonOk({
        success: true,
        message: 'Precio corregido',
        item: {
          id: updated.id,
          sku: updated.sku,
          productName: updated.productName,
          unitPrice: Number(updated.unitPrice)
        }
      })
    }

    if (payload.operation === 'schedule_price') {
      const scheduled = await prisma.systemActionLog.create({
        data: {
          actorAuthUserId: access.context.actor.userId,
          actorUsername: access.context.actor.username,
          actorRole: access.context.actor.role,
          action: 'inventory.price.schedule',
          entityType: 'InventoryItem',
          entityId: payload.inventoryItemId,
          status: 'pending',
          metadata: {
            newUnitPrice: payload.newUnitPrice,
            effectiveFrom: payload.effectiveFrom,
            reason: payload.reason
          }
        }
      })

      return jsonOk({
        success: true,
        message: 'Precio programado',
        schedule: {
          id: scheduled.id,
          inventoryItemId: scheduled.entityId,
          status: scheduled.status,
          metadata: scheduled.metadata,
          createdAt: scheduled.createdAt.toISOString()
        }
      })
    }

    if (payload.operation === 'stock_entry') {
      const updated = await prisma.$transaction(async transaction => {
        const item = await transaction.inventoryItem.findUnique({
          where: { id: payload.inventoryItemId }
        })
        if (!item) throw new Error('INVENTORY_ITEM_NOT_FOUND')

        const nextUnitPrice = calculateWeightedAveragePrice({
          currentStock: item.stock,
          currentUnitPrice: Number(item.unitPrice),
          incomingQuantity: payload.quantity,
          incomingUnitCost: payload.unitCost
        })

        const updatedItem = await transaction.inventoryItem.update({
          where: { id: payload.inventoryItemId },
          data: {
            stock: { increment: payload.quantity },
            unitPrice: nextUnitPrice
          }
        })

        await transaction.inventoryMovement.create({
          data: {
            inventoryItemId: payload.inventoryItemId,
            movementType: 'entry',
            quantity: payload.quantity,
            reason: JSON.stringify({
              reason: payload.reason,
              unitCost: payload.unitCost,
              valuationMethod: 'average',
              source: 'manual'
            })
          }
        })

        await transaction.systemActionLog.create({
          data: {
            actorAuthUserId: access.context.actor.userId,
            actorUsername: access.context.actor.username,
            actorRole: access.context.actor.role,
            action: 'inventory.movement.entry',
            entityType: 'InventoryItem',
            entityId: payload.inventoryItemId,
            status: 'success',
            metadata: {
              quantity: payload.quantity,
              unitCost: payload.unitCost,
              reason: payload.reason,
              nextUnitPrice
            }
          }
        })

        return updatedItem
      })

      return jsonOk({
        success: true,
        message: 'Entrada registrada',
        item: {
          id: updated.id,
          sku: updated.sku,
          productName: updated.productName,
          stock: updated.stock,
          unitPrice: Number(updated.unitPrice)
        }
      })
    }

    const updated = await prisma.$transaction(async transaction => {
      const item = await transaction.inventoryItem.findUnique({
        where: { id: payload.inventoryItemId }
      })
      if (!item) throw new Error('INVENTORY_ITEM_NOT_FOUND')
      if (item.stock < payload.quantity) throw new Error('INSUFFICIENT_STOCK')

      let unitCost = Number(item.unitPrice)
      let totalCost = Number((unitCost * payload.quantity).toFixed(2))
      let nextUnitPrice = Number(item.unitPrice)

      if (payload.valuationMethod === 'fifo') {
        const movements = await transaction.inventoryMovement.findMany({
          where: { inventoryItemId: payload.inventoryItemId },
          orderBy: { createdAt: 'asc' }
        })

        const valuationMovements = movements.map(movement => {
          const parsed = parseMovementMetadata(movement.reason)
          const movementUnitCost =
            parsed && typeof parsed.unitCost === 'number' && parsed.unitCost > 0 ? parsed.unitCost : Number(item.unitPrice)
          return {
            quantity: movement.quantity,
            unitCost: movementUnitCost,
            createdAt: movement.createdAt
          }
        })

        const lots = buildFifoLotsFromMovements(valuationMovements, item.stock, Number(item.unitPrice))
        const fifoResult = consumeFifoLots(lots, payload.quantity)
        unitCost = Number(fifoResult.unitCost.toFixed(2))
        totalCost = fifoResult.totalCost

        const remainingQty = fifoResult.remainingLots.reduce((sum, lot) => sum + Math.max(0, lot.remainingQty), 0)
        if (remainingQty > 0) {
          const remainingValue = fifoResult.remainingLots.reduce((sum, lot) => sum + lot.remainingQty * lot.unitCost, 0)
          nextUnitPrice = Number((remainingValue / remainingQty).toFixed(2))
        }
      }

      const updatedItem = await transaction.inventoryItem.update({
        where: { id: payload.inventoryItemId },
        data: {
          stock: { decrement: payload.quantity },
          unitPrice: nextUnitPrice
        }
      })

      await transaction.inventoryMovement.create({
        data: {
          inventoryItemId: payload.inventoryItemId,
          movementType: 'exit',
          quantity: -payload.quantity,
          reason: JSON.stringify({
            reason: payload.reason,
            valuationMethod: payload.valuationMethod,
            unitCost,
            totalCost,
            source: 'manual'
          })
        }
      })

      await transaction.systemActionLog.create({
        data: {
          actorAuthUserId: access.context.actor.userId,
          actorUsername: access.context.actor.username,
          actorRole: access.context.actor.role,
          action: 'inventory.movement.exit',
          entityType: 'InventoryItem',
          entityId: payload.inventoryItemId,
          status: 'success',
          metadata: {
            quantity: payload.quantity,
            valuationMethod: payload.valuationMethod,
            unitCost,
            totalCost,
            reason: payload.reason,
            nextUnitPrice
          }
        }
      })

      return { updatedItem, valuation: { unitCost, totalCost } }
    })

    return jsonOk({
      success: true,
      message: 'Salida registrada',
      item: {
        id: updated.updatedItem.id,
        sku: updated.updatedItem.sku,
        productName: updated.updatedItem.productName,
        stock: updated.updatedItem.stock,
        unitPrice: Number(updated.updatedItem.unitPrice)
      },
      valuation: updated.valuation
    })
  } catch (error) {
    // #region agent log
    console.error('[H9] inventory adjustment failed in catch', {
      name: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : 'unknown'
    })
    // #endregion
    const message =
      error instanceof Error && error.message === 'INVENTORY_ITEM_NOT_FOUND'
        ? 'Producto no encontrado'
        : error instanceof Error && error.message === 'INSUFFICIENT_STOCK'
            ? 'Stock insuficiente para la salida'
            : error instanceof Error && error.message === 'FIFO_STOCK_UNAVAILABLE'
              ? 'No hay lotes FIFO suficientes para cubrir la salida'
              : error instanceof Error && error.message === 'INVALID_JSON_BODY'
                ? 'Solicitud inválida: formato JSON incorrecto'
                : error instanceof Error && error.message === 'ADJUSTMENT_PAYLOAD_INVALID'
                  ? 'Solicitud inválida: faltan datos requeridos para el ajuste'
              : 'No fue posible aplicar el ajuste de inventario'

    return jsonError(message, 400, {
      code: 'INVENTORY_ADJUSTMENT_INVALID',
      details: error instanceof Error ? error.message : 'unknown error'
    })
  }
}
