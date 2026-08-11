import { getPrisma } from '@/src/lib/db/prisma'
import {
  closeCashSessionSchema,
  openCashSessionSchema,
  type CloseCashSessionInput,
  type OpenCashSessionInput
} from '@/src/lib/caja/cash-session-schema'
import type { AuthenticatedActor } from '@/src/lib/security/api-auth'

const toMoney = (value: number) => Number(value.toFixed(2))

const mapSession = (session: {
  id: string
  cashierUsername: string
  status: string
  openingFloat: { toString(): string } | number
  openedAt: Date
  closedAt: Date | null
  cashSalesTotal: { toString(): string } | number
  cardSalesTotal: { toString(): string } | number
  salesCount: number
  expectedCash: { toString(): string } | number | null
  countedCash: { toString(): string } | number | null
  variance: { toString(): string } | number | null
  notes: string | null
}) => ({
  id: session.id,
  cashierUsername: session.cashierUsername,
  status: session.status as 'open' | 'closed',
  openingFloat: toMoney(Number(session.openingFloat)),
  openedAt: session.openedAt.toISOString(),
  closedAt: session.closedAt?.toISOString() ?? null,
  cashSalesTotal: toMoney(Number(session.cashSalesTotal)),
  cardSalesTotal: toMoney(Number(session.cardSalesTotal)),
  salesCount: session.salesCount,
  expectedCash: session.expectedCash === null || session.expectedCash === undefined ? null : toMoney(Number(session.expectedCash)),
  countedCash: session.countedCash === null || session.countedCash === undefined ? null : toMoney(Number(session.countedCash)),
  variance: session.variance === null || session.variance === undefined ? null : toMoney(Number(session.variance)),
  notes: session.notes
})

export const getCashierRuntimeState = async (actor: AuthenticatedActor) => {
  const prisma = await getPrisma()
  const profile = await prisma.userProfile.findUnique({
    where: { id: actor.profileId },
    select: { cashierGate: true, role: true }
  })
  const openSession = await prisma.cashSession.findFirst({
    where: {
      cashierAuthUserId: actor.userId,
      status: 'open'
    },
    orderBy: { openedAt: 'desc' }
  })

  const gate = (profile?.cashierGate || 'ready') as 'ready' | 'on_shift' | 'must_logout'

  return {
    gate: actor.role === 'admin' ? (openSession ? 'on_shift' : 'ready') : gate,
    openSession: openSession ? mapSession(openSession) : null
  }
}

export const openCashSession = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input: OpenCashSessionInput = openCashSessionSchema.parse(rawInput)
  const prisma = await getPrisma()

  const existing = await prisma.cashSession.findFirst({
    where: { cashierAuthUserId: actor.userId, status: 'open' }
  })
  if (existing) {
    throw new Error('CASH_SESSION_ALREADY_OPEN')
  }

  if (actor.role === 'cashier') {
    const profile = await prisma.userProfile.findUnique({ where: { id: actor.profileId } })
    if (profile?.cashierGate === 'must_logout') {
      throw new Error('CASH_SESSION_MUST_LOGOUT')
    }
  }

  const session = await prisma.$transaction(async tx => {
    const created = await tx.cashSession.create({
      data: {
        cashierProfileId: actor.profileId,
        cashierAuthUserId: actor.userId,
        cashierUsername: actor.username,
        status: 'open',
        openingFloat: toMoney(input.openingFloat)
      }
    })

    if (actor.role === 'cashier') {
      await tx.userProfile.update({
        where: { id: actor.profileId },
        data: { cashierGate: 'on_shift' }
      })
    }

    await tx.systemActionLog.create({
      data: {
        actorAuthUserId: actor.userId,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'caja.session.open',
        entityType: 'CashSession',
        entityId: created.id,
        status: 'success',
        metadata: {
          openingFloat: toMoney(input.openingFloat)
        }
      }
    })

    return created
  })

  return mapSession(session)
}

export const previewExpectedCash = async (actor: AuthenticatedActor) => {
  const prisma = await getPrisma()
  const session = await prisma.cashSession.findFirst({
    where: { cashierAuthUserId: actor.userId, status: 'open' }
  })
  if (!session) {
    throw new Error('CASH_SESSION_NOT_OPEN')
  }

  const expectedCash = toMoney(Number(session.openingFloat) + Number(session.cashSalesTotal))
  return {
    session: mapSession(session),
    expectedCash
  }
}

export const closeCashSession = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input: CloseCashSessionInput = closeCashSessionSchema.parse(rawInput)
  const prisma = await getPrisma()

  const session = await prisma.cashSession.findFirst({
    where: { cashierAuthUserId: actor.userId, status: 'open' }
  })
  if (!session) {
    throw new Error('CASH_SESSION_NOT_OPEN')
  }

  const expectedCash = toMoney(Number(session.openingFloat) + Number(session.cashSalesTotal))
  const countedCash = toMoney(input.countedCash)
  const variance = toMoney(countedCash - expectedCash)

  const closed = await prisma.$transaction(async tx => {
    const updated = await tx.cashSession.update({
      where: { id: session.id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        expectedCash,
        countedCash,
        variance,
        notes: input.notes?.trim() || null
      }
    })

    if (actor.role === 'cashier') {
      await tx.userProfile.update({
        where: { id: actor.profileId },
        data: { cashierGate: 'must_logout' }
      })
    }

    await tx.systemActionLog.create({
      data: {
        actorAuthUserId: actor.userId,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'caja.session.close',
        entityType: 'CashSession',
        entityId: updated.id,
        status: 'success',
        metadata: {
          openingFloat: toMoney(Number(session.openingFloat)),
          cashSalesTotal: toMoney(Number(session.cashSalesTotal)),
          cardSalesTotal: toMoney(Number(session.cardSalesTotal)),
          salesCount: session.salesCount,
          expectedCash,
          countedCash,
          variance
        }
      }
    })

    return updated
  })

  return mapSession(closed)
}

export const listCashSessions = async (limit = 40) => {
  const prisma = await getPrisma()
  const sessions = await prisma.cashSession.findMany({
    orderBy: { openedAt: 'desc' },
    take: Math.min(100, Math.max(1, limit))
  })
  return sessions.map(mapSession)
}

export const requireOpenCashSessionId = async (actor: AuthenticatedActor) => {
  const prisma = await getPrisma()
  const session = await prisma.cashSession.findFirst({
    where: { cashierAuthUserId: actor.userId, status: 'open' },
    select: { id: true }
  })
  if (!session) {
    throw new Error('CASH_SESSION_REQUIRED')
  }
  return session.id
}

export const applySaleToCashSession = async (
  sessionId: string,
  paymentMethod: 'cash' | 'card',
  total: number
) => {
  const prisma = await getPrisma()
  const money = toMoney(total)
  await prisma.cashSession.update({
    where: { id: sessionId },
    data: {
      salesCount: { increment: 1 },
      ...(paymentMethod === 'cash'
        ? { cashSalesTotal: { increment: money } }
        : { cardSalesTotal: { increment: money } })
    }
  })
}

export const clearCashierLogoutGate = async (actor: AuthenticatedActor) => {
  if (actor.role !== 'cashier') return
  const prisma = await getPrisma()
  await prisma.userProfile.update({
    where: { id: actor.profileId },
    data: { cashierGate: 'ready' }
  })
}
