import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getFinanceDashboard } from '../src/lib/finance/finance-service'
import { getPrisma } from '../src/lib/db/prisma'

const logPath = resolve(process.cwd(), '..', 'debug-449600.log')
const writeDebug = (payload: Record<string, unknown>) => {
  appendFileSync(logPath, `${JSON.stringify({ sessionId: '449600', timestamp: Date.now(), ...payload })}\n`)
}

const main = async () => {
  const prisma = await getPrisma()

  const recentLogs = await prisma.systemActionLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: {
      id: true,
      action: true,
      entityId: true,
      status: true,
      createdAt: true,
      actorUsername: true
    }
  })

  const counts = new Map<string, number>()
  for (const row of recentLogs) {
    const key = `${row.action}|${row.entityId}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const triples = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([key, count]) => ({ key, count }))

  const draftsByActor = await prisma.systemActionLog.groupBy({
    by: ['actorAuthUserId'],
    where: { action: 'pos.draft.saved' },
    _count: true
  })

  const saleMeta = await prisma.systemActionLog.findMany({
    where: { action: 'sale.create' },
    select: { entityId: true, metadata: true, createdAt: true }
  })

  const weightNorm = await prisma.systemActionLog.count({
    where: { action: 'inventory.weight_stock.normalized' }
  })

  const dash = await getFinanceDashboard('day')
  const week = await getFinanceDashboard('week')

  const payload = {
    triples,
    draftsByActor,
    weightNorm,
    financeDay: dash.salesTotals.day,
    financeDayRange: dash.range,
    financeWeek: week.salesTotals.week,
    saleMetaStatus: saleMeta.map(row => {
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null
      return {
        entityId: row.entityId,
        metaStatus: meta?.status ?? null,
        createdAt: row.createdAt
      }
    }),
    recentActions: recentLogs.slice(0, 30).map(row => `${row.action} ${row.entityId.slice(0, 10)}`)
  }

  writeDebug({
    hypothesisId: 'A-D-E',
    location: 'scripts/debug-bitacora-extra.ts',
    message: 'triples drafts finance day',
    data: payload
  })

  console.log(JSON.stringify(payload, null, 2))
}

main().catch(error => {
  writeDebug({
    hypothesisId: 'A-D-E',
    location: 'scripts/debug-bitacora-extra.ts',
    message: 'failed',
    data: { error: error instanceof Error ? error.message : String(error) }
  })
  console.error(error)
  process.exitCode = 1
})
