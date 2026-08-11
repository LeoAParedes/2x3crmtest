import { ZodError } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { draftPayloadSchema } from '@/src/lib/pos/draft-schema'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) {
    return access.response
  }

  const prisma = await getPrisma()
  const latestDraft = await prisma.systemActionLog.findFirst({
    where: {
      actorAuthUserId: access.context.actor.userId,
      action: 'pos.draft.saved'
    },
    orderBy: { createdAt: 'desc' }
  })

  if (!latestDraft?.metadata || typeof latestDraft.metadata !== 'object' || Array.isArray(latestDraft.metadata)) {
    return jsonOk({ success: true, draft: null })
  }

  const parsed = draftPayloadSchema.safeParse(latestDraft.metadata)
  if (!parsed.success) {
    return jsonOk({ success: true, draft: null })
  }

  return jsonOk({
    success: true,
    draft: parsed.data
  })
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) {
    return access.response
  }

  try {
    const payload = draftPayloadSchema.parse(await request.json())
    const prisma = await getPrisma()
    const actorUserId = access.context.actor.userId

    // One durable draft row per cashier — never spam bitácora with create-per-keystroke.
    await prisma.$transaction(async tx => {
      const existing = await tx.systemActionLog.findFirst({
        where: {
          actorAuthUserId: actorUserId,
          action: 'pos.draft.saved'
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      })

      if (existing) {
        await tx.systemActionLog.deleteMany({
          where: {
            actorAuthUserId: actorUserId,
            action: 'pos.draft.saved',
            id: { not: existing.id }
          }
        })
        await tx.systemActionLog.update({
          where: { id: existing.id },
          data: {
            status: 'success',
            metadata: payload,
            actorUsername: access.context.actor.username,
            actorRole: access.context.actor.role
          }
        })
        return
      }

      await tx.systemActionLog.create({
        data: {
          actorAuthUserId: actorUserId,
          actorUsername: access.context.actor.username,
          actorRole: access.context.actor.role,
          action: 'pos.draft.saved',
          entityType: 'PosDraft',
          entityId: actorUserId,
          status: 'success',
          metadata: payload
        }
      })
    })

    return jsonOk({ success: true })
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError('Datos de borrador inválidos', 400, {
        code: 'POS_DRAFT_INVALID',
        details: error.flatten(),
        requestId: access.context.requestId
      })
    }
    return jsonError('No fue posible guardar el borrador de caja', 500, {
      code: 'POS_DRAFT_SAVE_FAILED',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
