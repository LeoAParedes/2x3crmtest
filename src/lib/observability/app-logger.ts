import { redactPii } from '@/src/lib/security/pii-redaction'

type LogLevel = 'info' | 'warn' | 'error'

export const appLog = (level: LogLevel, message: string, payload?: unknown) => {
  const now = new Date().toISOString()
  const sanitizedPayload = payload ? redactPii(payload) : undefined

  const record = JSON.stringify({
    timestamp: now,
    level,
    message,
    payload: sanitizedPayload
  })

  if (level === 'error') {
    console.error(record)
    return
  }

  if (level === 'warn') {
    console.warn(record)
    return
  }

  console.log(record)
}
