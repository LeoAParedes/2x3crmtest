import { NextResponse } from 'next/server'

import { env, hasLlmProviderConfig, hasMetaProviderConfig } from '@/src/lib/config/env'

export async function GET() {
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
    hints: [
      !env.metaAppSecret
        ? 'META_APP_SECRET falta: Meta POST al webhook devuelve 401 y el agente nunca corre.'
        : null,
      !hasMetaProviderConfig
        ? 'Faltan META_ACCESS_TOKEN, META_PHONE_NUMBER_ID o META_WEBHOOK_VERIFY_TOKEN.'
        : null,
      !hasLlmProviderConfig ? 'Falta OPENAI_API_KEY para respuestas DavinciAi.' : null
    ].filter(Boolean)
  })
}
