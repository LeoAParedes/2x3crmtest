import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanupSystemActionLogNoise } from '../src/lib/inventory/logbook-cleanup'
import { getPrisma } from '../src/lib/db/prisma'

const logPath = resolve(process.cwd(), '..', 'debug-449600.log')
const writeDebug = (payload: Record<string, unknown>) => {
  appendFileSync(logPath, `${JSON.stringify({ sessionId: '449600', timestamp: Date.now(), ...payload })}\n`)
}

const main = async () => {
  const prisma = await getPrisma()
  const beforeDrafts = await prisma.systemActionLog.count({ where: { action: 'pos.draft.saved' } })
  const beforeHidden = await prisma.systemActionLog.count({
    where: { action: { in: ['pos.draft.saved', 'inventory.weight_stock.normalized'] } }
  })
  const cleanup = await cleanupSystemActionLogNoise(prisma)
  const afterDrafts = await prisma.systemActionLog.count({ where: { action: 'pos.draft.saved' } })
  const saleMeta = await prisma.systemActionLog.findMany({
    where: { action: 'sale.create' },
    select: { metadata: true }
  })
  const completedMeta = saleMeta.filter(row => {
    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null
    return meta?.status === 'completed'
  }).length

  const payload = {
    beforeDrafts,
    beforeHidden,
    cleanup,
    afterDrafts,
    saleCreateCount: saleMeta.length,
    completedMeta
  }
  writeDebug({
    hypothesisId: 'A',
    location: 'scripts/run-logbook-cleanup.ts',
    message: 'post-cleanup DB state',
    data: payload,
    runId: 'cleanup-apply'
  })
  console.log(JSON.stringify(payload, null, 2))
}

main().catch(error => {
  writeDebug({
    hypothesisId: 'A',
    location: 'scripts/run-logbook-cleanup.ts',
    message: 'cleanup failed',
    data: { error: error instanceof Error ? error.message : String(error) }
  })
  console.error(error)
  process.exitCode = 1
})
