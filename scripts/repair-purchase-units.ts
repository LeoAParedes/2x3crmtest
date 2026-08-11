/**
 * Diagnose / repair purchase totals and legacy lot scales for weight products.
 *
 * Usage:
 *   npx tsx scripts/repair-purchase-units.ts           # dry-run (default)
 *   npx tsx scripts/repair-purchase-units.ts --apply   # write changes
 *   npx tsx scripts/repair-purchase-units.ts --apply --force  # re-run even if already marked
 *
 * Safe defaults: dry-run only. Ask before --apply on production.
 */
import { repairPurchaseUnitInconsistencies } from '../src/lib/inventory/repair-purchase-units'
import { getPrisma } from '../src/lib/db/prisma'

const main = async () => {
  const apply = process.argv.includes('--apply')
  const force = process.argv.includes('--force')
  const prisma = await getPrisma()

  const result = await repairPurchaseUnitInconsistencies(prisma, {
    dryRun: !apply,
    force
  })

  console.log(
    JSON.stringify(
      {
        mode: result.dryRun ? 'dry-run' : 'apply',
        alreadyRepaired: result.alreadyRepaired,
        purchaseCandidates: result.purchasePlans.length,
        lotCandidates: result.lotPlans.length,
        appliedPurchases: result.appliedPurchases,
        appliedLots: result.appliedLots,
        purchaseSample: result.purchasePlans.slice(0, 20),
        lotSample: result.lotPlans.slice(0, 20)
      },
      null,
      2
    )
  )

  if (result.dryRun && (result.purchasePlans.length > 0 || result.lotPlans.length > 0)) {
    console.log('\nRe-run with --apply to write these repairs (confirm on production first).')
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
