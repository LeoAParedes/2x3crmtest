'use client'

import { createBrowserClient } from '@supabase/ssr'

import { getPublicSupabaseEnv } from '@/src/lib/config/env'

export const createBrowserSupabaseClient = () => {
  const { url, publishableKey } = getPublicSupabaseEnv()
  return createBrowserClient(url, publishableKey)
}
