import { z } from 'zod'

import { DEFAULT_ALLOWED_ERP_TOOLS, ERP_TOOL_IDS, type ErpToolId } from '@/src/lib/ai/erp-tool-ids'
import { parseAllowedErpTools } from '@/src/lib/ai/erp-tool-registry'
import { getPrisma } from '@/src/lib/db/prisma'

const defaultInstructions = `
You are the 2x3crmtest ERP omnichannel assistant (DavinciAi).
You support customers and operators through web chat and WhatsApp.
For business metrics (sales, inventory, cash flow) you must use only whitelisted ERP tools and never invent numbers.
You can help with inventory questions, order status, account balances, return requests, payment promises, and handoff tickets.
Always keep answers concise and actionable in Spanish when the user speaks Spanish.
`.trim()

const allowedErpToolsSchema = z
  .array(z.enum(ERP_TOOL_IDS))
  .min(0)
  .max(ERP_TOOL_IDS.length)
  .default(DEFAULT_ALLOWED_ERP_TOOLS)

const mastraSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  modelId: z.string().min(3).max(120).default('openai/gpt-4.1-mini'),
  instructions: z.string().min(40).max(8000).default(defaultInstructions),
  allowWriteActions: z.boolean().default(true),
  allowFinancialActions: z.boolean().default(true),
  maxReplyChars: z.number().int().min(120).max(4000).default(900),
  defaultLocale: z.string().min(2).max(10).default('es-MX'),
  allowedErpTools: allowedErpToolsSchema
})

const mastraSettingsUpdateSchema = mastraSettingsSchema.partial().refine(payload => Object.keys(payload).length > 0, {
  message: 'At least one setting must be provided'
})

export type MastraSettings = z.infer<typeof mastraSettingsSchema>

type MastraSettingsRow = {
  enabled: boolean
  modelId: string
  instructions: string
  allowWriteActions: boolean
  allowFinancialActions: boolean
  maxReplyChars: number
  defaultLocale: string
  allowedErpTools: unknown
  updatedAt: Date
}

const mapSettings = (row: MastraSettingsRow) => {
  const allowedErpTools = parseAllowedErpTools(row.allowedErpTools) as ErpToolId[]
  return {
    enabled: row.enabled,
    modelId: row.modelId,
    instructions: row.instructions,
    allowWriteActions: row.allowWriteActions,
    allowFinancialActions: row.allowFinancialActions,
    maxReplyChars: row.maxReplyChars,
    defaultLocale: row.defaultLocale,
    allowedErpTools,
    updatedAt: row.updatedAt.toISOString()
  }
}

export const getMastraSettings = async () => {
  const prisma = await getPrisma()
  const defaults = mastraSettingsSchema.parse({})
  const row = await prisma.mastraSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      enabled: defaults.enabled,
      modelId: defaults.modelId,
      instructions: defaults.instructions,
      allowWriteActions: defaults.allowWriteActions,
      allowFinancialActions: defaults.allowFinancialActions,
      maxReplyChars: defaults.maxReplyChars,
      defaultLocale: defaults.defaultLocale,
      allowedErpTools: defaults.allowedErpTools
    }
  })
  return mapSettings(row)
}

export const updateMastraSettings = async (input: unknown) => {
  const patch = mastraSettingsUpdateSchema.parse(input)
  const prisma = await getPrisma()
  const defaults = mastraSettingsSchema.parse(patch)
  const row = await prisma.mastraSettings.upsert({
    where: { id: 'default' },
    update: {
      ...patch,
      ...(patch.allowedErpTools ? { allowedErpTools: patch.allowedErpTools } : {})
    },
    create: {
      id: 'default',
      enabled: defaults.enabled,
      modelId: defaults.modelId,
      instructions: defaults.instructions,
      allowWriteActions: defaults.allowWriteActions,
      allowFinancialActions: defaults.allowFinancialActions,
      maxReplyChars: defaults.maxReplyChars,
      defaultLocale: defaults.defaultLocale,
      allowedErpTools: defaults.allowedErpTools
    }
  })
  return mapSettings(row)
}

/**
 * Returns in-memory defaults without touching the database.
 * Used as a graceful-degradation fallback when the DB is unavailable
 * (e.g. a pending migration hasn't been applied yet).
 */
export const buildInMemoryMastraSettings = (): MastraSettings & { updatedAt: string } => {
  const defaults = mastraSettingsSchema.parse({})
  return {
    ...defaults,
    allowedErpTools: defaults.allowedErpTools as ErpToolId[],
    updatedAt: new Date().toISOString()
  }
}

export const getMastraSettingsCacheKey = (settings: MastraSettings) =>
  JSON.stringify({
    modelId: settings.modelId,
    instructions: settings.instructions,
    allowWriteActions: settings.allowWriteActions,
    allowFinancialActions: settings.allowFinancialActions,
    allowedErpTools: settings.allowedErpTools
  })
