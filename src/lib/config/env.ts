type RequiredConfig = {
  appBaseUrl: string
  dataMode: 'mock' | 'db'
  openAiApiKey?: string
  anthropicApiKey?: string
  metaAppSecret?: string
  metaWebhookVerifyToken?: string
  metaAccessToken?: string
  metaPhoneNumberId?: string
  metaBusinessAccountId?: string
  metaApiVersion: string
  twilioAuthToken?: string
  twilioAccountSid?: string
  redisUrl?: string
}

export type PublicSupabaseEnv = {
  url: string
  publishableKey: string
}

export type ServerEnv = PublicSupabaseEnv & {
  serviceRoleKey: string
  databaseUrl: string
  bootstrapAdminPassword?: string
  bootstrapCashierPassword?: string
}

const toOptional = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const requireEnvironmentValue = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

export const getPublicSupabaseEnv = (): PublicSupabaseEnv => ({
  url: requireEnvironmentValue('NEXT_PUBLIC_SUPABASE_URL'),
  publishableKey: requireEnvironmentValue('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
})

export const getServerEnv = (): ServerEnv => {
  const serviceRoleKey = requireEnvironmentValue('SUPABASE_SERVICE_ROLE_KEY')
  const databaseUrl = requireEnvironmentValue('DATABASE_URL')
  const publicEnv = getPublicSupabaseEnv()

  return {
    ...publicEnv,
    serviceRoleKey,
    databaseUrl,
    bootstrapAdminPassword: toOptional(process.env.BOOTSTRAP_ADMIN_PASSWORD),
    bootstrapCashierPassword: toOptional(process.env.BOOTSTRAP_CASHIER_PASSWORD)
  }
}

export const env: RequiredConfig = {
  appBaseUrl: process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000',
  dataMode: process.env.DATA_MODE === 'db' ? 'db' : 'mock',
  openAiApiKey: toOptional(process.env.OPENAI_API_KEY),
  anthropicApiKey: toOptional(process.env.ANTHROPIC_API_KEY),
  metaAppSecret: toOptional(process.env.META_APP_SECRET),
  metaWebhookVerifyToken: toOptional(process.env.META_WEBHOOK_VERIFY_TOKEN),
  metaAccessToken: toOptional(process.env.META_ACCESS_TOKEN),
  metaPhoneNumberId: toOptional(process.env.META_PHONE_NUMBER_ID),
  metaBusinessAccountId: toOptional(process.env.META_BUSINESS_ACCOUNT_ID),
  metaApiVersion: process.env.META_API_VERSION?.trim() || 'v21.0',
  twilioAuthToken: toOptional(process.env.TWILIO_AUTH_TOKEN),
  twilioAccountSid: toOptional(process.env.TWILIO_ACCOUNT_SID),
  redisUrl: toOptional(process.env.REDIS_URL)
}

export const hasMetaProviderConfig =
  Boolean(env.metaAccessToken) && Boolean(env.metaPhoneNumberId) && Boolean(env.metaWebhookVerifyToken)

export const hasLlmProviderConfig = Boolean(env.openAiApiKey || env.anthropicApiKey)
