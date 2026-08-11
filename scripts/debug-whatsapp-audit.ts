import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getPrisma } from '../src/lib/db/prisma'

const logPath = resolve(process.cwd(), '..', 'debug-449600.log')
const writeDebug = (payload: Record<string, unknown>) => {
  appendFileSync(logPath, `${JSON.stringify({ sessionId: '449600', timestamp: Date.now(), ...payload })}\n`)
}

const main = async () => {
  const prisma = await getPrisma()
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const agentActions = await prisma.agentAction.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: {
      id: true,
      actionType: true,
      status: true,
      createdAt: true,
      payload: true
    }
  })

  const processed = await prisma.processedEvent.findMany({
    where: { processedAt: { gte: since } },
    orderBy: { processedAt: 'desc' },
    take: 40
  })

  const mapped = agentActions.map(row => {
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {}
    return {
      actionType: row.actionType,
      status: row.status,
      createdAt: row.createdAt,
      channel: payload.channel ?? null,
      sessionId: payload.sessionId ?? null,
      metadata: payload.metadata ?? null
    }
  })

  const payload = {
    agentActions: mapped,
    processedEvents: processed.map(row => ({ id: row.id, processedAt: row.processedAt })),
    whatsappAgentCount: mapped.filter(row => row.channel === 'whatsapp').length,
    webAgentCount: mapped.filter(row => row.channel === 'web').length,
    processedCount: processed.length
  }

  writeDebug({
    hypothesisId: 'H1-H2',
    location: 'scripts/debug-whatsapp-audit.ts',
    message: 'whatsapp audit last 2h',
    data: payload
  })

  console.log(JSON.stringify(payload, null, 2))
}

main().catch(error => {
  writeDebug({
    hypothesisId: 'H1-H2',
    location: 'scripts/debug-whatsapp-audit.ts',
    message: 'failed',
    data: { error: error instanceof Error ? error.message : String(error) }
  })
  console.error(error)
  process.exitCode = 1
})
