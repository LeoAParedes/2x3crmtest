import { z } from 'zod'

import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { buildInMemoryPosSettings, getPosSettings, updatePosSettings } from '@/src/lib/pos/pos-settings'
import { requireApiAccess } from '@/src/lib/security/api-auth'
import { enforceSensitiveRateLimit } from '@/src/lib/security/sensitive-rate-limit'

const updateSchema = z.object({
  showIvaOnReceipt: z.boolean().optional(),
  defaultIvaRate: z.number().min(0).max(1).optional()
})

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const settings = await getPosSettings()
    return jsonOk({ success: true, settings })
  } catch {
    return jsonOk({ success: true, settings: buildInMemoryPosSettings(), degraded: true })
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) return access.response

  const rate = enforceSensitiveRateLimit(request, {
    scope: 'pos:settings:post',
    limit: 30,
    windowMs: 60_000
  })
  if (!rate.allowed) return rate.response

  try {
    const body = await request.json()
    const payload = updateSchema.parse(body)
    const settings = await updatePosSettings(payload)
    return jsonOk({ success: true, settings })
  } catch (error) {
    return jsonError('Invalid POS settings payload', 400, {
      details: error instanceof Error ? error.message : 'unknown error'
    })
  }
}
