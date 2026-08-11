import { describe, expect, it } from 'vitest'

import { ERP_TOOL_IDS } from '@/src/lib/ai/erp-tool-ids'
import { parseAllowedErpTools, toOpenAiTools } from '@/src/lib/ai/erp-tool-registry'
import { normalizeOpenAiModelId } from '@/src/lib/ai/openai-client'
import {
  normalizeEvolutionPhone,
  parseEvolutionWebhookPayload
} from '@/src/lib/whatsapp/evolution'
import {
  buildTwilioMessagingTwiml,
  normalizeTwilioWhatsAppPhone,
  parseTwilioWebhookForm
} from '@/src/lib/whatsapp/twilio'

describe('DavinciAi ERP whitelist registry', () => {
  it('filters unknown tool ids from settings payloads', () => {
    expect(parseAllowedErpTools(['sales_total_today', 'drop_table', 'low_stock_count'])).toEqual([
      'sales_total_today',
      'low_stock_count',
      'recent_pos_sales',
      'inventory_snapshot'
    ])
  })

  it('includes all registry tools in the default catalog', () => {
    expect(ERP_TOOL_IDS).toContain('recent_pos_sales')
    expect(ERP_TOOL_IDS).toContain('inventory_snapshot')
    expect(toOpenAiTools([...ERP_TOOL_IDS])).toHaveLength(ERP_TOOL_IDS.length)
  })

  it('exposes only whitelisted OpenAI function tools', () => {
    const tools = toOpenAiTools(['sales_total_today', 'stock_by_product_search'])
    expect(tools.map(tool => tool.function.name)).toEqual(['sales_total_today', 'stock_by_product_search'])
    expect(tools.every(tool => ERP_TOOL_IDS.includes(tool.function.name as (typeof ERP_TOOL_IDS)[number]))).toBe(true)
  })

  it('normalizes openai/ prefixed model ids', () => {
    expect(normalizeOpenAiModelId('openai/gpt-4.1-mini')).toBe('gpt-4.1-mini')
  })
})

describe('Twilio WhatsApp webhook helpers', () => {
  it('parses form-urlencoded inbound messages', () => {
    const form = new URLSearchParams({
      MessageSid: 'SM123',
      From: 'whatsapp:+5215512345678',
      To: 'whatsapp:+14155238886',
      Body: '¿cuánto vendimos hoy?',
      ProfileName: 'Dueño'
    })

    expect(parseTwilioWebhookForm(form)).toEqual({
      messageSid: 'SM123',
      from: 'whatsapp:+5215512345678',
      to: 'whatsapp:+14155238886',
      body: '¿cuánto vendimos hoy?',
      profileName: 'Dueño'
    })
  })

  it('strips whatsapp: prefix from phones', () => {
    expect(normalizeTwilioWhatsAppPhone('whatsapp:+5215512345678')).toBe('+5215512345678')
  })

  it('builds escaped TwiML replies', () => {
    expect(buildTwilioMessagingTwiml('Ventas: $1 < 2 & "ok"')).toContain(
      'Ventas: $1 &lt; 2 &amp; &quot;ok&quot;'
    )
  })
})

describe('Evolution WhatsApp webhook helpers', () => {
  it('parses messages.upsert conversation payloads', () => {
    const parsed = parseEvolutionWebhookPayload({
      event: 'messages.upsert',
      instance: 'davinci',
      data: {
        key: {
          remoteJid: '5215512345678@s.whatsapp.net',
          fromMe: false,
          id: '3EB0AAAA'
        },
        pushName: 'Dueño',
        message: {
          conversation: '¿cuánto vendimos hoy?'
        }
      }
    })

    expect(parsed).toEqual([
      {
        messageId: '3EB0AAAA',
        from: '5215512345678',
        body: '¿cuánto vendimos hoy?',
        profileName: 'Dueño',
        instance: 'davinci',
        remoteJid: '5215512345678@s.whatsapp.net'
      }
    ])
  })

  it('parses MESSAGES_UPSERT extendedText and data arrays', () => {
    const parsed = parseEvolutionWebhookPayload({
      event: 'MESSAGES_UPSERT',
      instance: 'davinci',
      data: [
        {
          key: {
            remoteJid: '5215599999999@s.whatsapp.net',
            fromMe: false,
            id: 'EXT1'
          },
          message: {
            extendedTextMessage: {
              text: 'stock del sku ABC'
            }
          }
        },
        {
          key: {
            remoteJid: '120363@g.us',
            fromMe: false,
            id: 'GROUP1'
          },
          message: {
            conversation: 'ignorar grupo'
          }
        },
        {
          key: {
            remoteJid: '5215511111111@s.whatsapp.net',
            fromMe: true,
            id: 'ME1'
          },
          message: {
            conversation: 'eco propio'
          }
        }
      ]
    })

    expect(parsed).toEqual([
      {
        messageId: 'EXT1',
        from: '5215599999999',
        body: 'stock del sku ABC',
        profileName: undefined,
        instance: 'davinci',
        remoteJid: '5215599999999@s.whatsapp.net'
      }
    ])
  })

  it('normalizes jid phones', () => {
    expect(normalizeEvolutionPhone('5215512345678@s.whatsapp.net')).toBe('5215512345678')
    expect(normalizeEvolutionPhone('+5215512345678')).toBe('5215512345678')
  })
})
