import crypto from 'node:crypto'

import { env } from '@/src/lib/config/env'

export const isValidMetaSignature = (rawBody: string, signatureHeader: string | null) => {
  if (!env.metaAppSecret) {
    return false
  }

  if (!signatureHeader?.startsWith('sha256=')) {
    return false
  }

  const signature = signatureHeader.replace('sha256=', '')
  const expected = crypto.createHmac('sha256', env.metaAppSecret).update(rawBody).digest('hex')
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
}
