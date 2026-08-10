import { getPrisma } from '@/src/lib/db/prisma'

const ttlMs = 1000 * 60 * 60

export const wasEventProcessed = async (eventId: string) => {
  const prisma = await getPrisma()
  const event = await prisma.processedEvent.findUnique({ where: { id: eventId } })
  return Boolean(event && event.expiresAt > new Date())
}

export const markEventProcessed = async (eventId: string) => {
  const prisma = await getPrisma()
  await prisma.processedEvent.upsert({
    where: { id: eventId },
    update: {
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + ttlMs)
    },
    create: {
      id: eventId,
      expiresAt: new Date(Date.now() + ttlMs)
    }
  })
  await prisma.processedEvent.deleteMany({ where: { expiresAt: { lt: new Date() } } })
}
