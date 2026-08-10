import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const draftItemSchema = z.object({
  inventoryItemId: z.string().cuid(),
  sku: z.string().min(1).max(64),
  productName: z.string().min(1).max(160),
  unitPrice: z.number().nonnegative(),
  unitMode: z.enum(['piece', 'weight']),
  quantityInput: z.string().min(1).max(24)
})

const draftPayloadSchema = z.object({
  cart: z.array(draftItemSchema).max(200),
  paymentMethod: z.enum(['cash', 'card']),
  amountReceived: z.number().nonnegative().nullable()
})

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
    await prisma.systemActionLog.create({
      data: {
        actorAuthUserId: access.context.actor.userId,
        actorUsername: access.context.actor.username,
        actorRole: access.context.actor.role,
        action: 'pos.draft.saved',
        entityType: 'PosDraft',
        entityId: access.context.actor.userId,
        status: 'success',
        metadata: payload
      }
    })
    return jsonOk({ success: true })
  } catch (error) {
    return jsonError('No fue posible guardar el borrador de caja', 400, {
      code: 'POS_DRAFT_INVALID',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
