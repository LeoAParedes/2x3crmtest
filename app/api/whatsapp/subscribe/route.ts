import { subscribeCurrentAppToWaba } from '@/src/lib/whatsapp/meta-subscription-check'
import { safeRecordAgentAction } from '@/src/lib/crm/agent-action-audit'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

/**
 * Subscribes the Meta app that owns META_ACCESS_TOKEN to the configured WABA.
 * Use when Graph shows only Meta's internal DevX test app subscribed.
 */
export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  const result = await subscribeCurrentAppToWaba()
  if (!result.ok) {
    await safeRecordAgentAction({
      actionType: 'whatsapp.waba.subscribe_failed',
      status: 'failed',
      actorRole: access.context.role,
      actorType: 'human',
      channel: 'whatsapp',
      metadata: { reason: result.error }
    })
    return jsonError(result.error || 'Unable to subscribe app to WABA', 502)
  }

  await safeRecordAgentAction({
    actionType: 'whatsapp.waba.subscribe_ok',
    status: 'success',
    actorRole: access.context.role,
    actorType: 'human',
    channel: 'whatsapp',
    metadata: {
      subscribedApps: result.subscription.subscribedApps,
      hasOnlyMetaInternalTestApp: result.subscription.hasOnlyMetaInternalTestApp
    }
  })

  return jsonOk({
    success: true,
    graph: result.graph,
    fieldSubscription: result.fieldSubscription,
    callbackUri: result.callbackUri,
    subscription: result.subscription
  })
}
