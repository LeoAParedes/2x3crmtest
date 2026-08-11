import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getPrisma } from '../src/lib/db/prisma'

const logPath = resolve(process.cwd(), '..', 'debug-449600.log')

const main = async () => {
  const prisma = await getPrisma()
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const convos = await prisma.conversation.findMany({
    where: { channel: 'whatsapp', updatedAt: { gte: since } },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 10 } }
  })

  const summary = convos.map(conversation => ({
    sessionId: conversation.sessionId,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map(message => ({
      direction: message.direction,
      createdAt: message.createdAt,
      intent: message.intent,
      runMode: message.runMode,
      text: (message.messageText || '').slice(0, 320)
    }))
  }))

  appendFileSync(
    logPath,
    `${JSON.stringify({
      sessionId: '449600',
      hypothesisId: 'H4',
      location: 'scripts/debug-whatsapp-convos.ts',
      message: 'whatsapp conversation texts',
      timestamp: Date.now(),
      data: { count: convos.length, summary }
    })}\n`
  )

  console.log(JSON.stringify(summary, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
