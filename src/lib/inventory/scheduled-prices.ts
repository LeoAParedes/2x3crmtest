import { getPrisma } from '@/src/lib/db/prisma'

type PrismaClientType = Awaited<ReturnType<typeof getPrisma>>

type ScheduledMetadata = {
  newUnitPrice: number
  effectiveFrom: string
  appliedAt?: string
}

const asScheduledMetadata = (value: unknown): ScheduledMetadata | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.newUnitPrice !== 'number') return null
  if (typeof record.effectiveFrom !== 'string') return null
  return {
    newUnitPrice: record.newUnitPrice,
    effectiveFrom: record.effectiveFrom,
    appliedAt: typeof record.appliedAt === 'string' ? record.appliedAt : undefined
  }
}

export const applyDueScheduledPrices = async (prisma: PrismaClientType, now = new Date()) => {
  const pendingLogs = await prisma.systemActionLog.findMany({
    where: {
      action: 'inventory.price.schedule',
      status: 'pending'
    },
    orderBy: { createdAt: 'asc' },
    take: 500
  })

  let applied = 0
  for (const log of pendingLogs) {
    const metadata = asScheduledMetadata(log.metadata)
    if (!metadata) continue
    const effectiveAt = new Date(metadata.effectiveFrom)
    if (!Number.isFinite(effectiveAt.getTime())) continue
    if (effectiveAt.getTime() > now.getTime()) continue

    await prisma.inventoryItem.update({
      where: { id: log.entityId },
      data: { unitPrice: metadata.newUnitPrice }
    })

    await prisma.systemActionLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        metadata: {
          ...metadata,
          appliedAt: now.toISOString()
        }
      }
    })
    applied += 1
  }

  return { applied }
}
