import { NextResponse } from 'next/server'

import { clearCashierLogoutGate } from '@/src/lib/caja/cash-session-service'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'
import { createServerSupabaseClient } from '@/src/lib/supabase/server'

export const getLogoutRedirectUrl = (requestUrl: string, appBaseUrl = process.env.NEXT_PUBLIC_BASE_URL) =>
  new URL('/login', appBaseUrl || requestUrl)

export async function POST(request: Request) {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (actor) {
    try {
      await clearCashierLogoutGate(actor)
    } catch {
      // Best-effort gate reset; always continue with sign-out.
    }
  }

  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(getLogoutRedirectUrl(request.url), 303)
}
