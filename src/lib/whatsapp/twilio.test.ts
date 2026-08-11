import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('twilio signature validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('accepts when only an alternate URL candidate matches', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token')
    const { isValidTwilioSignature } = await import('@/src/lib/whatsapp/twilio')

    const publicUrl = 'https://2x3crmtest.vercel.app/api/whatsapp/twilio/webhook'
    const params = new URLSearchParams({
      MessageSid: 'SMxxxxxxxx',
      From: 'whatsapp:+5216862256637',
      To: 'whatsapp:+15554401702',
      Body: 'Hola'
    })

    let data = publicUrl
    for (const key of [...params.keys()].sort()) {
      data += key + (params.get(key) || '')
    }
    const signature = createHmac('sha1', 'test-token').update(Buffer.from(data, 'utf8')).digest('base64')

    expect(
      isValidTwilioSignature({
        signature,
        url: 'http://127.0.0.1:3000/api/whatsapp/twilio/webhook',
        urlCandidates: [publicUrl],
        params
      })
    ).toBe(true)
  })
})
