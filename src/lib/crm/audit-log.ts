import type { ChatReply, CrmNormalizedMessage } from '@/src/lib/crm/channel-schema'
import { getPrisma } from '@/src/lib/db/prisma'

export type ConversationAuditEntry = {
  id: string
  createdAt: string
  channel: 'web' | 'whatsapp'
  sessionId: string
  customerId?: string
  inbound: string
  outbound: string
  intent: string
  runMode: 'mastra' | 'fallback'
  handoffRequired: boolean
}

export const pushConversationAudit = async (message: CrmNormalizedMessage, reply: ChatReply) => {
  const prisma = await getPrisma()
  await prisma.$transaction(async transaction => {
    if (message.customerId) {
      await transaction.customer.upsert({
        where: { id: message.customerId },
        update: {},
        create: { id: message.customerId, displayName: message.customerId }
      })
    }
    const conversation =
      (await transaction.conversation.findFirst({
        where: { channel: message.channel, sessionId: message.sessionId }
      })) ||
      (await transaction.conversation.create({
        data: {
          channel: message.channel,
          sessionId: message.sessionId,
          customerId: message.customerId
        }
      }))
    await transaction.conversationMessage.createMany({
      data: [
        {
          conversationId: conversation.id,
          direction: 'inbound',
          messageText: message.message
        },
        {
          conversationId: conversation.id,
          direction: 'outbound',
          messageText: reply.reply,
          intent: reply.intent,
          runMode: reply.runMode,
          metadata: { handoffRequired: Boolean(reply.handoff?.required) }
        }
      ]
    })
  })
}

export const listConversationAudit = async (limit = 25): Promise<ConversationAuditEntry[]> => {
  const prisma = await getPrisma()
  const conversations = await prisma.conversation.findMany({
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 2 } },
    orderBy: { updatedAt: 'desc' },
    take: limit
  })
  return conversations.map(conversation => {
    const inbound = conversation.messages.find(item => item.direction === 'inbound')
    const outbound = conversation.messages.find(item => item.direction === 'outbound')
    const metadata =
      outbound?.metadata && typeof outbound.metadata === 'object' && !Array.isArray(outbound.metadata)
        ? outbound.metadata
        : {}
    return {
      id: conversation.id,
      createdAt: conversation.updatedAt.toISOString(),
      channel: conversation.channel as 'web' | 'whatsapp',
      sessionId: conversation.sessionId,
      customerId: conversation.customerId || undefined,
      inbound: inbound?.messageText || '',
      outbound: outbound?.messageText || '',
      intent: outbound?.intent || 'unknown',
      runMode: (outbound?.runMode || 'fallback') as 'mastra' | 'fallback',
      handoffRequired: metadata && 'handoffRequired' in metadata ? Boolean(metadata.handoffRequired) : false
    }
  })
}
