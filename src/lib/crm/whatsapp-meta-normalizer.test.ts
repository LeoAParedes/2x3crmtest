import { describe, expect, it } from 'vitest'

import { normalizeMetaWebhookPayload } from '@/src/lib/crm/channel-normalizer'

describe('normalizeMetaWebhookPayload', () => {
  it('accepts Meta dashboard test payload with extra WhatsApp fields', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1518543490021582',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15552047381',
                  phone_number_id: '1250940554772750'
                },
                contacts: [
                  {
                    profile: { name: 'Leo P' },
                    wa_id: '5216862256637',
                    user_id: 'MX.3693383147460498',
                    country_code: 'MX'
                  }
                ],
                messages: [
                  {
                    from: '5216862256637',
                    from_user_id: 'MX.3693383147460498',
                    id: 'wamid.HBgNNTIxNjg2MjI1NjYzNxUCABIYIEFDRjg5QUIxOUUxRThDOUQyMDYwQzU0RDY3MDY1MDFEAA==',
                    timestamp: '1786421125',
                    text: { body: 'Hola' },
                    from_logical_id: '245960278020225',
                    type: 'text',
                    internal_1p_only_data: {
                      account_context: {
                        waac_id: '1407986211426370',
                        cs_id: '1250940554772750',
                        account_context_type: 'non_paid_messaging'
                      }
                    }
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    }

    const messages = normalizeMetaWebhookPayload(payload as never)

    expect(messages).toHaveLength(1)
    expect(messages[0]?.sourcePhone).toBe('5216862256637')
    expect(messages[0]?.message.message).toBe('Hola')
    expect(messages[0]?.message.channel).toBe('whatsapp')
    expect(messages[0]?.sourceProfileName).toBe('Leo P')
  })
})
