import { NextResponse } from 'next/server'

import { env, hasLlmProviderConfig, hasMetaProviderConfig } from '@/src/lib/config/env'
import { getWebhookDebugState } from '@/src/lib/whatsapp/webhook-debug-state'

export async function GET() {
  const webhookDebug = getWebhookDebugState()

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
      llmProviderConfigured: hasLlmProviderConfig
    },
    webhookDebug: {
      note: 'In-memory on this serverless instance. Check immediately after sending a WhatsApp message.',
      lastHit: webhookDebug.lastHit,
      recentHits: webhookDebug.recentHits
    },
    hints: [
      !env.metaAppSecret
        ? 'META_APP_SECRET falta: Meta POST al webhook devuelve 401 y el agente nunca corre.'
        : null,
      !hasMetaProviderConfig
        ? 'Faltan META_ACCESS_TOKEN, META_PHONE_NUMBER_ID o META_WEBHOOK_VERIFY_TOKEN.'
        : null,
      !hasLlmProviderConfig ? 'Falta OPENAI_API_KEY para respuestas DavinciAi.' : null,
      !webhookDebug.lastHit
        ? 'Sin POST reciente en esta instancia: Meta puede no estar entregando mensajes, o el cold start perdió el historial.'
        : null
    ].filter(Boolean)
  })
}
