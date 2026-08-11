/**
 * Set ivaRate = 0 on bottled drinking-water inventory products.
 *
 * Usage:
 *   npx tsx scripts/repair-water-iva.ts           # dry-run (default)
 *   npx tsx scripts/repair-water-iva.ts --apply   # write changes
 */
import 'dotenv/config'

import { repairWaterIvaExemptions } from '../src/lib/inventory/repair-water-iva'
import { getPrisma } from '../src/lib/db/prisma'

const main = async () => {
  const apply = process.argv.includes('--apply')
  const prisma = await getPrisma()

  const result = await repairWaterIvaExemptions(prisma, {
    dryRun: !apply,
    actorUsername: 'repair-water-iva'
  })

  console.log(
    JSON.stringify(
      {
        mode: result.dryRun ? 'dry-run' : 'apply',
        candidates: result.plans.length,
        applied: result.applied,
        plans: result.plans
      },
      null,
      2
    )
  )

  if (result.dryRun && result.plans.length > 0) {
    console.log('\nRe-run with --apply to write these repairs (confirm on production first).')
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
