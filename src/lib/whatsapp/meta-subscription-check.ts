import { env } from '@/src/lib/config/env'

type GraphError = {
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

export type MetaSubscriptionCheck = {
  checkedAt: string
  ok: boolean
  phoneNumberId: string | null
  businessAccountId: string | null
  phoneDisplayNumber: string | null
  phoneVerifiedName: string | null
  subscribedApps: Array<{ id?: string; name?: string }>
  messagesFieldLikelyActive: boolean | null
  graphErrors: string[]
  hints: string[]
}

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

export const checkMetaWhatsAppSubscription = async (): Promise<MetaSubscriptionCheck> => {
  const graphErrors: string[] = []
  const hints: string[] = []
  const phoneNumberId = env.metaPhoneNumberId || null
  const businessAccountId = env.metaBusinessAccountId || null

  let phoneDisplayNumber: string | null = null
  let phoneVerifiedName: string | null = null
  let subscribedApps: Array<{ id?: string; name?: string }> = []

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
    const apps = await graphGet<{
      data?: Array<{ id?: string; name?: string }>
    }>(`/${businessAccountId}/subscribed_apps`)
    if (apps.error) {
      graphErrors.push(`subscribed_apps: ${apps.error}`)
    } else {
      subscribedApps = apps.data?.data || []
      if (subscribedApps.length === 0) {
        hints.push(
          'WABA sin apps suscritas: en Meta Developers → WhatsApp → Configuration, vuelve a suscribir el webhook y marca el campo messages.'
        )
      }
    }
  } else {
    hints.push('Falta META_BUSINESS_ACCOUNT_ID (WABA id) para verificar subscribed_apps.')
  }

  // Graph does not always expose subscribed fields here; infer from presence of subscribed apps.
  const messagesFieldLikelyActive = subscribedApps.length > 0 ? true : subscribedApps.length === 0 ? false : null

  if (phoneDisplayNumber) {
    hints.push(`Debes escribir a este número de WhatsApp Business: ${phoneDisplayNumber}`)
  }

  return {
    checkedAt: new Date().toISOString(),
    ok: graphErrors.length === 0 && subscribedApps.length > 0,
    phoneNumberId,
    businessAccountId,
    phoneDisplayNumber,
    phoneVerifiedName,
    subscribedApps,
    messagesFieldLikelyActive,
    graphErrors,
    hints
  }
}
