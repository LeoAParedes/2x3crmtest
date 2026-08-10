import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { getPublicSupabaseEnv } from '@/src/lib/config/env'

export const createServerSupabaseClient = async () => {
  const cookieStore = await cookies()
  const { url, publishableKey } = getPublicSupabaseEnv()

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components cannot write cookies; proxy.ts handles refresh.
        }
      }
    }
  })
}
