import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'

export const DEFAULT_IVA_RATE = 0.16

const posSettingsSchema = z.object({
  showIvaOnReceipt: z.boolean().default(false),
  defaultIvaRate: z.number().min(0).max(1).default(DEFAULT_IVA_RATE)
})

const posSettingsUpdateSchema = posSettingsSchema.partial().refine(payload => Object.keys(payload).length > 0, {
  message: 'At least one setting must be provided'
})

export type PosSettings = z.infer<typeof posSettingsSchema>

const mapRow = (row: { showIvaOnReceipt: boolean; defaultIvaRate: unknown; updatedAt: Date }) => ({
  showIvaOnReceipt: row.showIvaOnReceipt,
  defaultIvaRate: Number(row.defaultIvaRate),
  updatedAt: row.updatedAt.toISOString()
})

export const getPosSettings = async (): Promise<PosSettings & { updatedAt: string }> => {
  const prisma = await getPrisma()
  const defaults = posSettingsSchema.parse({})
  const row = await prisma.posSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      showIvaOnReceipt: defaults.showIvaOnReceipt,
      defaultIvaRate: defaults.defaultIvaRate
    }
  })
  return mapRow(row)
}

export const updatePosSettings = async (input: unknown) => {
  const patch = posSettingsUpdateSchema.parse(input)
  const prisma = await getPrisma()
  const defaults = posSettingsSchema.parse(patch)
  const row = await prisma.posSettings.upsert({
    where: { id: 'default' },
    update: patch,
    create: {
      id: 'default',
      showIvaOnReceipt: defaults.showIvaOnReceipt,
      defaultIvaRate: defaults.defaultIvaRate
    }
  })
  return mapRow(row)
}

export const buildInMemoryPosSettings = (): PosSettings & { updatedAt: string } => {
  const defaults = posSettingsSchema.parse({})
  return {
    ...defaults,
    updatedAt: new Date().toISOString()
  }
}
