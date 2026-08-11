import type { PrismaClient } from '@prisma/client'

import { WEIGHT_STOCK_NORMALIZED_ACTION } from '@/src/lib/inventory/weight-units'

/** Actions that are operational noise, not audit-worthy events in bitácora. */
export const BITACORA_HIDDEN_ACTIONS = new Set([
  'pos.draft.saved',
  WEIGHT_STOCK_NORMALIZED_ACTION
])

type PrismaLike = Pick<PrismaClient, 'systemActionLog'>

/**
 * Keep a single trail row per real event:
 * - collapse draft spam to latest per cashier
 * - collapse duplicate action+entityId+status bursts
 */
export const cleanupSystemActionLogNoise = async (prisma: PrismaLike) => {
  const draftLogs = await prisma.systemActionLog.findMany({
    where: { action: 'pos.draft.saved' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, actorAuthUserId: true, createdAt: true }
  })

  const keepDraftIds = new Set<string>()
  const seenActors = new Set<string>()
  for (const row of draftLogs) {
    const key = row.actorAuthUserId || 'unknown'
    if (seenActors.has(key)) continue
    seenActors.add(key)
    keepDraftIds.add(row.id)
  }
  const draftIdsToDelete = draftLogs.filter(row => !keepDraftIds.has(row.id)).map(row => row.id)

  const recent = await prisma.systemActionLog.findMany({
    where: {
      action: { notIn: [...BITACORA_HIDDEN_ACTIONS] }
    },
    orderBy: { createdAt: 'desc' },
    take: 800,
    select: {
      id: true,
      action: true,
      entityId: true,
      status: true,
      actorUsername: true,
      createdAt: true
    }
  })

  const keepEventIds = new Set<string>()
  const duplicateIds: string[] = []
  for (const row of recent) {
    const bucket = Math.floor(row.createdAt.getTime() / 2000)
    const key = `${row.action}|${row.entityId}|${row.status}|${row.actorUsername}|${bucket}`
    if (keepEventIds.has(key)) {
      duplicateIds.push(row.id)
      continue
    }
    keepEventIds.add(key)
  }

  const idsToDelete = [...new Set([...draftIdsToDelete, ...duplicateIds])]
  let deletedTotal = 0
  for (let index = 0; index < idsToDelete.length; index += 100) {
    const chunk = idsToDelete.slice(index, index + 100)
    const result = await prisma.systemActionLog.deleteMany({
      where: { id: { in: chunk } }
    })
    deletedTotal += result.count
  }

  // Mark historical POS tickets as completed in bitácora metadata (Sale rows already use status=completed).
  const saleLogs = await prisma.systemActionLog.findMany({
    where: { action: 'sale.create' },
    select: { id: true, metadata: true }
  })
  let backfilledSaleMeta = 0
  for (const row of saleLogs) {
    const existing =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {}
    if (existing.status === 'completed') continue
    await prisma.systemActionLog.update({
      where: { id: row.id },
      data: {
        metadata: {
          ...existing,
          status: 'completed'
        }
      }
    })
    backfilledSaleMeta += 1
  }

  return {
    deletedDrafts: draftIdsToDelete.length,
    deletedDuplicates: duplicateIds.length,
    deletedTotal,
    backfilledSaleMeta
  }
}

export const dedupeLogbookRows = <T extends { action: string; entityId?: string | null; status: string; createdAt: string | Date }>(
  rows: T[]
): T[] => {
  const seen = new Set<string>()
  const result: T[] = []
  for (const row of rows) {
    if (BITACORA_HIDDEN_ACTIONS.has(row.action)) continue
    const createdAt = typeof row.createdAt === 'string' ? new Date(row.createdAt) : row.createdAt
    const bucket = Math.floor(createdAt.getTime() / 2000)
    const key = `${row.action}|${row.entityId || ''}|${row.status}|${bucket}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(row)
  }
  return result
}
