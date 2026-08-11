import { env } from '@/src/lib/config/env'

type GraphError = {
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

type SubscribedAppRow = {
  id?: string
  name?: string
  whatsapp_business_api_data?: {
    id?: string
    name?: string
    link?: string
    category?: string
  }
}

export type MetaSubscriptionCheck = {
  checkedAt: string
  ok: boolean
  phoneNumberId: string | null
  businessAccountId: string | null
  phoneDisplayNumber: string | null
  phoneVerifiedName: string | null
  tokenAppId: string | null
  tokenAppName: string | null
  tokenAppIsSubscribed: boolean | null
  subscribedApps: Array<{ id: string; name: string; isMetaInternalTestApp: boolean }>
  hasOnlyMetaInternalTestApp: boolean
  appWebhookSubscriptions: Array<{
    object?: string
    callbackUrl?: string
    active?: boolean
    fields: string[]
  }>
  messagesFieldSubscribed: boolean | null
  messagesFieldLikelyActive: boolean | null
  graphErrors: string[]
  hints: string[]
}

const META_INTERNAL_TEST_APP_IDS = new Set([
  '2202427980234937' // WA DevX Webhook Events 1P App
])

const graphGet = async <T,>(path: string): Promise<{ data?: T; error?: string }> => {
  if (!env.metaAccessToken) {
    return { error: 'META_ACCESS_TOKEN missing' }
  }

  const url = `https://graph.facebook.com/${env.metaApiVersion}${path}`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.metaAccessToken}`
    },
    cache: 'no-store'
  })
  const payload = (await response.json()) as T & GraphError
  if (!response.ok) {
    return {
      error: payload.error?.message || `Graph HTTP ${response.status}`
    }
  }
  return { data: payload }
}

const graphPost = async <T,>(
  path: string,
  body?: Record<string, string>
): Promise<{ data?: T; error?: string }> => {
  if (!env.metaAccessToken) {
    return { error: 'META_ACCESS_TOKEN missing' }
  }

  const url = `https://graph.facebook.com/${env.metaApiVersion}${path}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.metaAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  })
  const payload = (await response.json()) as T & GraphError
  if (!response.ok) {
    return {
      error: payload.error?.message || `Graph HTTP ${response.status}`
    }
  }
  return { data: payload }
}

const normalizeSubscribedApps = (rows: SubscribedAppRow[]) =>
  rows
    .map(row => {
      const id = row.whatsapp_business_api_data?.id || row.id || ''
      const name = row.whatsapp_business_api_data?.name || row.name || 'unknown'
      return {
        id,
        name,
        isMetaInternalTestApp:
          META_INTERNAL_TEST_APP_IDS.has(id) ||
          name.toLowerCase().includes('devx webhook') ||
          name.toLowerCase().includes('1p app')
      }
    })
    .filter(app => Boolean(app.id))

export const checkMetaWhatsAppSubscription = async (): Promise<MetaSubscriptionCheck> => {
  const graphErrors: string[] = []
  const hints: string[] = []
  const phoneNumberId = env.metaPhoneNumberId || null
  const businessAccountId = env.metaBusinessAccountId || null

  let phoneDisplayNumber: string | null = null
  let phoneVerifiedName: string | null = null
  let tokenAppId: string | null = null
  let tokenAppName: string | null = null
  let subscribedApps: MetaSubscriptionCheck['subscribedApps'] = []
  let appWebhookSubscriptions: MetaSubscriptionCheck['appWebhookSubscriptions'] = []

  if (!env.metaAccessToken) {
    hints.push('Falta META_ACCESS_TOKEN para inspeccionar suscripciones en Graph API.')
  } else {
    const appInfo = await graphGet<{ id?: string; name?: string }>('/app?fields=id,name')
    if (appInfo.error) {
      graphErrors.push(`token_app: ${appInfo.error}`)
    } else {
      tokenAppId = appInfo.data?.id || null
      tokenAppName = appInfo.data?.name || null
    }
  }

  if (tokenAppId && env.metaAppSecret) {
    const appAccessToken = `${tokenAppId}|${env.metaAppSecret}`
    const subsUrl = `https://graph.facebook.com/${env.metaApiVersion}/${tokenAppId}/subscriptions?access_token=${encodeURIComponent(appAccessToken)}`
    const subsResponse = await fetch(subsUrl, { cache: 'no-store' })
    const subsPayload = (await subsResponse.json()) as {
      data?: Array<{
        object?: string
        callback_url?: string
        active?: boolean
        fields?: Array<{ name?: string } | string>
      }>
      error?: { message?: string }
    }
    if (!subsResponse.ok) {
      graphErrors.push(`app_subscriptions: ${subsPayload.error?.message || `Graph HTTP ${subsResponse.status}`}`)
    } else {
      appWebhookSubscriptions = (subsPayload.data || []).map(row => ({
        object: row.object,
        callbackUrl: row.callback_url,
        active: row.active,
        fields: (row.fields || []).map(field => (typeof field === 'string' ? field : field.name || '')).filter(Boolean)
      }))
    }
  }

  if (phoneNumberId) {
    const phone = await graphGet<{
      display_phone_number?: string
      verified_name?: string
      id?: string
    }>(`/${phoneNumberId}?fields=display_phone_number,verified_name,id`)
    if (phone.error) {
      graphErrors.push(`phone: ${phone.error}`)
    } else {
      phoneDisplayNumber = phone.data?.display_phone_number || null
      phoneVerifiedName = phone.data?.verified_name || null
    }
  } else {
    hints.push('Falta META_PHONE_NUMBER_ID.')
  }

  if (businessAccountId) {
    const apps = await graphGet<{ data?: SubscribedAppRow[] }>(`/${businessAccountId}/subscribed_apps`)
    if (apps.error) {
      graphErrors.push(`subscribed_apps: ${apps.error}`)
    } else {
      subscribedApps = normalizeSubscribedApps(apps.data?.data || [])
    }
  } else {
    hints.push('Falta META_BUSINESS_ACCOUNT_ID (WABA id) para verificar subscribed_apps.')
  }

  const hasOnlyMetaInternalTestApp =
    subscribedApps.length > 0 && subscribedApps.every(app => app.isMetaInternalTestApp)
  const tokenAppIsSubscribed = tokenAppId
    ? subscribedApps.some(app => app.id === tokenAppId)
    : null
  const waSubscription = appWebhookSubscriptions.find(sub => sub.object === 'whatsapp_business_account')
  const messagesFieldSubscribed = waSubscription
    ? waSubscription.fields.includes('messages')
    : appWebhookSubscriptions.length > 0
      ? false
      : null

  if (tokenAppId && tokenAppName) {
    hints.push(`Tu META_ACCESS_TOKEN pertenece a la app "${tokenAppName}" (id ${tokenAppId}).`)
  }

  if (messagesFieldSubscribed === false) {
    hints.push(
      'La app no tiene el campo webhook "messages" suscrito. En Meta → App crmtest → WhatsApp → Configuration, marca messages. O pulsa otra vez Suscribir app al WABA (ahora también intenta suscribir el campo).'
    )
  }

  if (waSubscription?.callbackUrl && !waSubscription.callbackUrl.includes('/api/whatsapp/webhook')) {
    hints.push(`Callback de la app apunta a ${waSubscription.callbackUrl}, no a /api/whatsapp/webhook.`)
  }

  if (subscribedApps.length === 0) {
    hints.push(
      'WABA sin apps suscritas. Usa el botón "Suscribir app al WABA" en Configuración → Chatbot, o en Meta Developers abre esa misma app.'
    )
  }

  if (hasOnlyMetaInternalTestApp || tokenAppIsSubscribed === false) {
    hints.push(
      'Messaging en verde en Meta NO basta si Graph solo lista "WA DevX Webhook Events 1P App". Esa es la app de prueba de Meta. Debes suscribir TU app al WABA (botón en Configuración → Chatbot, o Graph POST /{waba-id}/subscribed_apps con tu token).'
    )
  }

  if (phoneDisplayNumber) {
    hints.push(`Debes escribir a este número de WhatsApp Business: ${phoneDisplayNumber}`)
  }

  return {
    checkedAt: new Date().toISOString(),
    ok: graphErrors.length === 0 && Boolean(tokenAppIsSubscribed) && messagesFieldSubscribed !== false,
    phoneNumberId,
    businessAccountId,
    phoneDisplayNumber,
    phoneVerifiedName,
    tokenAppId,
    tokenAppName,
    tokenAppIsSubscribed,
    subscribedApps,
    hasOnlyMetaInternalTestApp,
    appWebhookSubscriptions,
    messagesFieldSubscribed,
    messagesFieldLikelyActive: Boolean(tokenAppIsSubscribed) && messagesFieldSubscribed !== false,
    graphErrors,
    hints
  }
}

const resolveWebhookCallbackUri = () => {
  const configuredBase = env.appBaseUrl.replace(/\/$/, '')
  const productionFallback = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
    : 'https://2x3crmtest.vercel.app'
  const baseUrl =
    !configuredBase || configuredBase.includes('localhost') ? productionFallback : configuredBase
  return `${baseUrl}/api/whatsapp/webhook`
}

export const subscribeCurrentAppToWaba = async () => {
  if (!env.metaBusinessAccountId) {
    return { ok: false as const, error: 'META_BUSINESS_ACCOUNT_ID missing' }
  }
  if (!env.metaWebhookVerifyToken) {
    return { ok: false as const, error: 'META_WEBHOOK_VERIFY_TOKEN missing' }
  }
  if (!env.metaAppSecret) {
    return { ok: false as const, error: 'META_APP_SECRET missing' }
  }

  const callbackUri = resolveWebhookCallbackUri()
  // Meta verifies this callback with GET hub.challenge using verify_token.
  // Without override_callback_uri, WABA can stay on Meta DevX and never POST to Vercel.
  const result = await graphPost<{ success?: boolean }>(`/${env.metaBusinessAccountId}/subscribed_apps`, {
    override_callback_uri: callbackUri,
    verify_token: env.metaWebhookVerifyToken
  })
  if (result.error) {
    return {
      ok: false as const,
      error: `${result.error} (callback=${callbackUri}). Confirma que META_WEBHOOK_VERIFY_TOKEN en Vercel es exactamente el mismo que usas al verificar el webhook en Meta.`
    }
  }

  const appInfo = await graphGet<{ id?: string }>('/app?fields=id')
  const appId = appInfo.data?.id
  let fieldSubscription: { ok: boolean; error?: string; data?: unknown } = {
    ok: false,
    error: 'app id unavailable'
  }
  if (appId) {
    // App-level webhook field subscription (messages). Uses app access token form.
    const appAccessToken = `${appId}|${env.metaAppSecret}`
    const url = `https://graph.facebook.com/${env.metaApiVersion}/${appId}/subscriptions`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        object: 'whatsapp_business_account',
        callback_url: callbackUri,
        verify_token: env.metaWebhookVerifyToken,
        fields: 'messages',
        access_token: appAccessToken
      }),
      cache: 'no-store'
    })
    const payload = (await response.json()) as { success?: boolean; error?: { message?: string } }
    fieldSubscription = response.ok
      ? { ok: true, data: payload }
      : { ok: false, error: payload.error?.message || `Graph HTTP ${response.status}` }
  }

  const check = await checkMetaWhatsAppSubscription()
  return {
    ok: true as const,
    graph: result.data,
    fieldSubscription,
    callbackUri,
    subscription: check
  }
}
