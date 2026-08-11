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
  subscribedApps: Array<{ id: string; name: string; isMetaInternalTestApp: boolean }>
  hasOnlyMetaInternalTestApp: boolean
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

const graphPost = async <T,>(path: string): Promise<{ data?: T; error?: string }> => {
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
  let subscribedApps: MetaSubscriptionCheck['subscribedApps'] = []

  if (!env.metaAccessToken) {
    hints.push('Falta META_ACCESS_TOKEN para inspeccionar suscripciones en Graph API.')
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
  const hasUserAppSubscribed = subscribedApps.some(app => !app.isMetaInternalTestApp)

  if (subscribedApps.length === 0) {
    hints.push(
      'WABA sin apps suscritas: en Meta Developers → tu app → WhatsApp → Configuration, configura el webhook y suscribe messages.'
    )
  }

  if (hasOnlyMetaInternalTestApp) {
    hints.push(
      'El WABA solo tiene suscrita la app interna de Meta (WA DevX Webhook Events 1P App). Por eso ves el payload de prueba en Meta, pero NINGÚN mensaje llega a 2x3crmtest.vercel.app. Suscribe TU app: Meta Developers → tu app → WhatsApp → Configuration → Webhook → Subscribe, campo messages ON. O usa POST /api/whatsapp/subscribe como admin.'
    )
  }

  if (phoneDisplayNumber) {
    hints.push(`Debes escribir a este número de WhatsApp Business: ${phoneDisplayNumber}`)
  }

  return {
    checkedAt: new Date().toISOString(),
    ok: graphErrors.length === 0 && hasUserAppSubscribed,
    phoneNumberId,
    businessAccountId,
    phoneDisplayNumber,
    phoneVerifiedName,
    subscribedApps,
    hasOnlyMetaInternalTestApp,
    messagesFieldLikelyActive: hasUserAppSubscribed,
    graphErrors,
    hints
  }
}

export const subscribeCurrentAppToWaba = async () => {
  if (!env.metaBusinessAccountId) {
    return { ok: false as const, error: 'META_BUSINESS_ACCOUNT_ID missing' }
  }

  const result = await graphPost<{ success?: boolean }>(`/${env.metaBusinessAccountId}/subscribed_apps`)
  if (result.error) {
    return { ok: false as const, error: result.error }
  }

  const check = await checkMetaWhatsAppSubscription()
  return {
    ok: true as const,
    graph: result.data,
    subscription: check
  }
}
