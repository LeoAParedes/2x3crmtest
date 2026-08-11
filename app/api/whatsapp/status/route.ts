import { NextResponse } from 'next/server'

import {
  env,
  hasLlmProviderConfig,
  hasMetaProviderConfig,
  isOpenAiApiKeyFormatValid
} from '@/src/lib/config/env'
import { checkMetaWhatsAppSubscription } from '@/src/lib/whatsapp/meta-subscription-check'
import { getWebhookDebugState } from '@/src/lib/whatsapp/webhook-debug-state'

export async function GET(request: Request) {
  const webhookDebug = getWebhookDebugState()
  const { searchParams } = new URL(request.url)
  const includeMeta = searchParams.get('meta') === '1'
  const openAiKeyFormatValid = isOpenAiApiKeyFormatValid()

  const metaSubscription = includeMeta ? await checkMetaWhatsAppSubscription() : null
  const lastOutbound = webhookDebug.recentHits.find(hit => hit.stage === 'outbound')
  const recipientNotAllowed = Boolean(
    lastOutbound?.reason?.includes('131030') || lastOutbound?.reason?.includes('not in allowed list')
  )

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    whatsapp: {
      metaProviderConfigured: hasMetaProviderConfig,
      metaAppSecretConfigured: Boolean(env.metaAppSecret),
      metaAccessTokenConfigured: Boolean(env.metaAccessToken),
      metaPhoneNumberIdConfigured: Boolean(env.metaPhoneNumberId),
      metaWebhookVerifyTokenConfigured: Boolean(env.metaWebhookVerifyToken),
      metaApiVersion: env.metaApiVersion,
      phoneNumberIdSuffix: env.metaPhoneNumberId?.slice(-4) || null
    },
    ai: {
      llmProviderConfigured: hasLlmProviderConfig,
      openAiKeyPresent: Boolean(env.openAiApiKey),
      openAiKeyFormatValid
    },
    webhookDebug: {
      note: 'In-memory on this serverless instance. Check immediately after sending a WhatsApp message.',
      lastHit: webhookDebug.lastHit,
      recentHits: webhookDebug.recentHits,
      lastOutbound
    },
    blockers: {
      openAiKeyInvalid: !openAiKeyFormatValid,
      recipientNotInAllowedList: recipientNotAllowed
    },
    metaSubscription,
    hints: [
      !env.metaAppSecret
        ? 'META_APP_SECRET falta: Meta POST al webhook devuelve 401 y el agente nunca corre.'
        : null,
      !hasMetaProviderConfig
        ? 'Faltan META_ACCESS_TOKEN, META_PHONE_NUMBER_ID o META_WEBHOOK_VERIFY_TOKEN.'
        : null,
      !openAiKeyFormatValid
        ? 'OPENAI_API_KEY inválida o es texto placeholder. En Vercel debe ser una key real que empiece con sk- (no pegues el mensaje de ayuda). Luego Redeploy.'
        : null,
      recipientNotAllowed
        ? 'Meta #131030: tu número no está en la lista To de prueba. Meta Developers → crmtest → WhatsApp → API Setup → agrega tu número en To y verifícalo.'
        : null,
      !webhookDebug.lastHit
        ? 'Sin POST reciente en esta instancia: envía un WhatsApp a +1 555-204-7381 y vuelve a comprobar.'
        : null,
      ...(metaSubscription?.hints || [])
    ].filter(Boolean)
  })
}
