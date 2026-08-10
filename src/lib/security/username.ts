import { z } from 'zod'

const allowedUsernameSchema = z.enum(['admin', 'cajero'])

export type LoginUsername = z.infer<typeof allowedUsernameSchema>

export const parseLoginUsername = (username: unknown): LoginUsername => {
  const normalized = typeof username === 'string' ? username.trim().toLowerCase() : username
  const parsed = allowedUsernameSchema.safeParse(normalized)
  if (!parsed.success) {
    throw new Error('Usuario inválido')
  }
  return parsed.data
}

export const usernameToInternalEmail = (username: unknown) => {
  const parsed = parseLoginUsername(username)
  return `${parsed}@2x3crmtest.local`
}
