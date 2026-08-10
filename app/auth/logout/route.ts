import { NextResponse } from 'next/server'

import { createServerSupabaseClient } from '@/src/lib/supabase/server'

export const getLogoutRedirectUrl = (requestUrl: string, appBaseUrl = process.env.NEXT_PUBLIC_BASE_URL) =>
  new URL('/login', appBaseUrl || requestUrl)

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(getLogoutRedirectUrl(request.url), 303)
}
