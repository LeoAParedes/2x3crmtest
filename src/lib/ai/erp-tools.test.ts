import { describe, expect, it } from 'vitest'

import { ERP_TOOL_IDS } from '@/src/lib/ai/erp-tool-ids'
import { parseAllowedErpTools, toOpenAiTools } from '@/src/lib/ai/erp-tool-registry'
import { normalizeOpenAiModelId } from '@/src/lib/ai/openai-client'
import {
  buildTwilioMessagingTwiml,
  normalizeTwilioWhatsAppPhone,
  parseTwilioWebhookForm
} from '@/src/lib/whatsapp/twilio'

describe('DavinciAi ERP whitelist registry', () => {
  it('filters unknown tool ids from settings payloads', () => {
    expect(parseAllowedErpTools(['sales_total_today', 'drop_table', 'low_stock_count'])).toEqual([
      'sales_total_today',
      'low_stock_count'
    ])
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
