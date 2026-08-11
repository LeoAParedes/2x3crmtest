import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { verifyErpDbHarness } from '@/src/lib/ai/erp-db-harness'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  try {
    // Touch prisma first so connection errors are explicit.
    const prisma = await getPrisma()
    await prisma.sale.count()

    const snapshot = await verifyErpDbHarness()
    return jsonOk({
      success: snapshot.ok,
      harness: 'davinci-db-only',
      snapshot
    })
  } catch (error) {
    return jsonError('Harness DavinciAi no pudo leer Supabase/Postgres', 503, {
      code: 'DAVINCI_DB_HARNESS_FAILED',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
