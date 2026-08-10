const phoneRegex = /(\+?\d[\d\s\-()]{6,}\d)/g
const emailRegex = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi

const redactString = (input: string) => {
  return input.replace(phoneRegex, '[redacted-phone]').replace(emailRegex, '[redacted-email]')
}

export const redactPii = <T>(value: T): T => {
  if (typeof value === 'string') {
    return redactString(value) as T
  }

  if (Array.isArray(value)) {
    return value.map(item => redactPii(item)) as T
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, nested]) => [key, redactPii(nested)])
    return Object.fromEntries(entries) as T
  }

  return value
}
