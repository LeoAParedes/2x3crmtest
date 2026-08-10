import { z } from 'zod'

export const crmMessageMetadataSchema = z
  .object({
    sourceMessageId: z.string().min(1).max(200).optional(),
    sourceEventId: z.string().min(1).max(200).optional(),
    customerPhone: z.string().min(7).max(30).optional(),
    customerName: z.string().min(1).max(120).optional(),
    localeHint: z.string().min(2).max(10).optional(),
    rawPayload: z.unknown().optional()
  })
  .passthrough()

export const crmNormalizedMessageSchema = z.object({
  channel: z.enum(['web', 'whatsapp']),
  customerId: z.string().min(1).max(120).optional(),
  sessionId: z.string().min(1).max(120),
  message: z.string().min(1).max(4000),
  locale: z.string().min(2).max(10).default('es-MX'),
  metadata: crmMessageMetadataSchema.default({})
})

export const webChatPayloadSchema = z.object({
  sessionId: z.string().min(1).max(120),
  customerId: z.string().min(1).max(120).optional(),
  message: z.string().min(1).max(4000),
  locale: z.string().min(2).max(10).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

export const chatReplySchema = z.object({
  reply: z.string().min(1),
  intent: z.string().min(1),
  actions: z.array(z.string()).default([]),
  handoff: z
    .object({
      required: z.boolean(),
      reason: z.string().min(1),
      ticketId: z.string().min(1).optional()
    })
    .optional(),
  runMode: z.enum(['mastra', 'fallback']).default('fallback')
})

export type CrmNormalizedMessage = z.infer<typeof crmNormalizedMessageSchema>
export type WebChatPayload = z.infer<typeof webChatPayloadSchema>
export type ChatReply = z.infer<typeof chatReplySchema>
