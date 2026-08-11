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

  const actions = await prisma.agentAction.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 15
  })

  const whatsapp = actions
    .map(row => {
      const payload =
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {}
      return { ...row, payload }
    })
    .filter(row => row.payload.channel === 'whatsapp')

  // Conversation messages if model exists
  let conversations: unknown[] = []
  try {
    conversations = await prisma.conversation.findMany({
      where: { updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 6 } }
    })
  } catch {
    conversations = []
  }

  writeDebug({
    hypothesisId: 'H3-H4',
    location: 'scripts/debug-whatsapp-replies.ts',
    message: 'whatsapp reply payloads',
    data: {
      whatsappCount: whatsapp.length,
      latest: whatsapp.slice(0, 5).map(row => ({
        createdAt: row.createdAt,
        status: row.status,
        actionType: row.actionType,
        payload: row.payload
      })),
      conversationsPreview: conversations
    }
  })

  console.log(
    JSON.stringify(
      {
        whatsappCount: whatsapp.length,
        latest: whatsapp.slice(0, 5).map(row => ({
          createdAt: row.createdAt,
          status: row.status,
          payload: row.payload
        }))
      },
      null,
      2
    )
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
