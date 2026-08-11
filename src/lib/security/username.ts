import { z } from 'zod'

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{2,31}$/, 'Usuario inválido')

export type LoginUsername = string

export const parseLoginUsername = (username: unknown): LoginUsername => {
  const parsed = usernameSchema.safeParse(typeof username === 'string' ? username : username)
  if (!parsed.success) {
    throw new Error('Usuario inválido')
  }
  return parsed.data
}

export const usernameToInternalEmail = (username: unknown) => {
  const parsed = parseLoginUsername(username)
  return `${parsed}@2x3crmtest.local`
}
