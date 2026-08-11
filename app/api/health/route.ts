import { NextResponse } from 'next/server'

import {
  env,
  hasLlmProviderConfig,
  hasMetaProviderConfig,
  isOpenAiApiKeyFormatValid
} from '@/src/lib/config/env'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: '2x3crmtest',
    timestamp: new Date().toISOString(),
    channels: {
      webChat: true,
      whatsappMeta: hasMetaProviderConfig,
      metaAppSecretConfigured: Boolean(env.metaAppSecret)
    },
    ai: {
      mastraConfigured: true,
      llmProviderConfigured: hasLlmProviderConfig,
      openAiKeyPresent: Boolean(env.openAiApiKey),
      openAiKeyFormatValid: isOpenAiApiKeyFormatValid()
    },
    dataMode: env.dataMode
  })
}
