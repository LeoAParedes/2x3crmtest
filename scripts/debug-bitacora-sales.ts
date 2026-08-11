import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getPrisma } from '../src/lib/db/prisma'

const logPath = resolve(process.cwd(), '..', 'debug-449600.log')

const writeDebug = (payload: Record<string, unknown>) => {
  appendFileSync(
    logPath,
    `${JSON.stringify({ sessionId: '449600', timestamp: Date.now(), ...payload })}\n`
  )
}

const main = async () => {
  const prisma = await getPrisma()

  const byStatus = await prisma.sale.groupBy({
    by: ['status'],
    _count: true,
    orderBy: { _count: { status: 'desc' } }
  })

  const recentSales = await prisma.sale.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      id: true,
      saleNumber: true,
      status: true,
      total: true,
      createdAt: true,
      cashierUsername: true
    }
  })

  const logByAction = await prisma.systemActionLog.groupBy({
    by: ['action'],
    _count: true,
    orderBy: { _count: { action: 'desc' } }
  })

  const draftCount = await prisma.systemActionLog.count({
    where: { action: 'pos.draft.saved' }
  })

  const saleCreateGroups = await prisma.systemActionLog.groupBy({
    by: ['entityId'],
    where: { action: 'sale.create' },
    _count: true,
    having: { entityId: { _count: { gt: 1 } } }
  })

  const saleCreateLogs = await prisma.systemActionLog.findMany({
    where: { action: 'sale.create' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, entityId: true, status: true, createdAt: true, metadata: true }
  })

  const recentLogs = await prisma.systemActionLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true,
      action: true,
      entityId: true,
      status: true,
      createdAt: true,
      actorUsername: true
    }
  })

  const burstDupes: Array<{ key: string; id: string; firstId: string }> = []
  const seen = new Map<string, string>()
  for (const row of recentLogs) {
    const bucket = Math.floor(row.createdAt.getTime() / 2000)
    const key = `${row.action}|${row.entityId}|${bucket}`
    const firstId = seen.get(key)
    if (firstId) {
      burstDupes.push({ key, id: row.id, firstId })
    } else {
      seen.set(key, row.id)
    }
  }

  // Triple pattern: same action appearing 3x with same entity in short window
  const actionEntityCounts = new Map<string, number>()
  for (const row of recentLogs) {
    const key = `${row.action}|${row.entityId}`
    actionEntityCounts.set(key, (actionEntityCounts.get(key) || 0) + 1)
  }
  const triples = [...actionEntityCounts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([key, count]) => ({ key, count }))

  const summary = {
    byStatus,
    draftCount,
    topActions: logByAction.slice(0, 20),
    saleCreateDuplicateEntityCount: saleCreateGroups.length,
    saleCreateGroups: saleCreateGroups.slice(0, 15),
    recentSales,
    saleCreateMetaStatus: saleCreateLogs.map(row => {
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null
      return {
        id: row.id,
        entityId: row.entityId,
        logStatus: row.status,
        metaStatus: meta?.status ?? null,
        createdAt: row.createdAt
      }
    }),
    recentLogs,
    burstDupes,
    triples
  }

  writeDebug({
    hypothesisId: 'A-B-C',
    location: 'scripts/debug-bitacora-sales.ts',
    message: 'DB snapshot sales+bitacora',
    data: {
      byStatus,
      draftCount,
      topActions: summary.topActions,
      saleCreateDuplicateEntityCount: summary.saleCreateDuplicateEntityCount,
      saleCreateGroups: summary.saleCreateGroups,
      recentSalesStatuses: recentSales.map(sale => ({
        id: sale.id,
        status: sale.status,
        saleNumber: sale.saleNumber
      })),
      burstDupeCount: burstDupes.length,
      triples,
      recentActionSample: recentLogs.slice(0, 25).map(row => row.action)
    }
  })

  console.log(JSON.stringify(summary, null, 2))
}

main().catch(error => {
  writeDebug({
    hypothesisId: 'A-B-C',
    location: 'scripts/debug-bitacora-sales.ts',
    message: 'DB snapshot failed',
    data: { error: error instanceof Error ? error.message : String(error) }
  })
  console.error(error)
  process.exitCode = 1
})
