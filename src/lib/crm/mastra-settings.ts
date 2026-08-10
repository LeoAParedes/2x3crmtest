import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'

const defaultInstructions = `
You are the 2x3crmtest ERP omnichannel assistant.
You support customers and operators through web chat and WhatsApp.
You can help with inventory questions, order status, account balances, return requests, payment promises, and handoff tickets.
Always keep answers concise and actionable in Spanish when the user speaks Spanish.
`.trim()

const mastraSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  modelId: z.string().min(3).max(120).default('openai/gpt-4.1-mini'),
  instructions: z.string().min(40).max(8000).default(defaultInstructions),
  allowWriteActions: z.boolean().default(true),
  allowFinancialActions: z.boolean().default(true),
  maxReplyChars: z.number().int().min(120).max(4000).default(900),
  defaultLocale: z.string().min(2).max(10).default('es-MX')
})

const mastraSettingsUpdateSchema = mastraSettingsSchema.partial().refine(payload => Object.keys(payload).length > 0, {
  message: 'At least one setting must be provided'
})

export type MastraSettings = z.infer<typeof mastraSettingsSchema>

const mapSettings = (row: MastraSettings & { updatedAt: Date }) => ({
  enabled: row.enabled,
  modelId: row.modelId,
  instructions: row.instructions,
  allowWriteActions: row.allowWriteActions,
  allowFinancialActions: row.allowFinancialActions,
  maxReplyChars: row.maxReplyChars,
  defaultLocale: row.defaultLocale,
  updatedAt: row.updatedAt.toISOString()
})

export const getMastraSettings = async () => {
  const prisma = await getPrisma()
  const row = await prisma.mastraSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      ...mastraSettingsSchema.parse({})
    }
  })
  return mapSettings(row)
}

export const updateMastraSettings = async (input: unknown) => {
  const patch = mastraSettingsUpdateSchema.parse(input)
  const prisma = await getPrisma()
  const row = await prisma.mastraSettings.upsert({
    where: { id: 'default' },
    update: patch,
    create: {
      id: 'default',
      ...mastraSettingsSchema.parse(patch)
    }
  })
  return mapSettings(row)
}

export const getMastraSettingsCacheKey = (settings: MastraSettings) =>
  JSON.stringify({
    modelId: settings.modelId,
    instructions: settings.instructions,
    allowWriteActions: settings.allowWriteActions,
    allowFinancialActions: settings.allowFinancialActions
  })
