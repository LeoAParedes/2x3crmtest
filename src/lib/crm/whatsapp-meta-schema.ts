import { z } from 'zod'

const textMessageSchema = z.object({
  from: z.string().min(7).max(32),
  id: z.string().min(1).max(200),
  timestamp: z.string().min(1).max(30),
  type: z.string(),
  text: z
    .object({
      body: z.string().min(1).max(4000)
    })
    .optional()
})

const contactSchema = z.object({
  wa_id: z.string().min(7).max(32),
  profile: z
    .object({
      name: z.string().min(1).max(120).optional()
    })
    .optional()
})

const valueSchema = z.object({
  metadata: z
    .object({
      phone_number_id: z.string().min(1).max(120).optional()
    })
    .optional(),
  contacts: z.array(contactSchema).optional(),
  messages: z.array(textMessageSchema).optional()
})

const changeSchema = z.object({
  field: z.string(),
  value: valueSchema
})

const entrySchema = z.object({
  id: z.string().optional(),
  changes: z.array(changeSchema).default([])
})

export const metaWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(entrySchema).default([])
})

export type MetaWebhookPayload = z.infer<typeof metaWebhookPayloadSchema>
