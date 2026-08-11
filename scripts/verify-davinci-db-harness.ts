import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { runDeterministicErpDbReply, verifyErpDbHarness } from '../src/lib/ai/erp-db-harness'

const logPath = resolve(process.cwd(), '..', 'debug-449600.log')
const writeDebug = (payload: Record<string, unknown>) => {
  appendFileSync(logPath, `${JSON.stringify({ sessionId: '449600', timestamp: Date.now(), ...payload })}\n`)
}

const main = async () => {
  const snapshot = await verifyErpDbHarness()
  const sample = await runDeterministicErpDbReply('¿Cuánto vendimos hoy y esta semana?', [
    'sales_total_today',
    'sales_total_period',
    'cash_flow_period',
    'recent_pos_sales',
    'inventory_snapshot',
    'low_stock_count',
    'expenses_total_period',
    'top_product_period',
    'average_ticket_period',
    'stock_by_product_search'
  ])

  writeDebug({
    hypothesisId: 'H1',
    location: 'scripts/verify-davinci-db-harness.ts',
    message: 'runtime harness verification',
    runId: 'post-harness',
    data: {
      snapshotOk: snapshot.ok,
      mismatches: snapshot.mismatches,
      salesCompletedCount: snapshot.salesCompletedCount,
      salesCompletedTodayCount: snapshot.salesCompletedTodayCount,
      inventorySkuCount: snapshot.inventorySkuCount,
      usedTools: sample.usedTools,
      replyPreview: sample.reply.slice(0, 400),
      provenanceSources: sample.results
        .filter(result => result.ok)
        .map(result => ({
          toolId: result.toolId,
          source: result.facts.provenance
            ? (result.facts.provenance as { source?: string }).source
            : null
        }))
    }
  })

  console.log(
    JSON.stringify(
      {
        snapshot,
        sampleReply: sample.reply,
        usedTools: sample.usedTools
      },
      null,
      2
    )
  )

  if (!snapshot.ok) {
    process.exitCode = 1
  }
}

main().catch(error => {
  writeDebug({
    hypothesisId: 'H1',
    location: 'scripts/verify-davinci-db-harness.ts',
    message: 'harness verify failed',
    data: { error: error instanceof Error ? error.message : String(error) }
  })
  console.error(error)
  process.exitCode = 1
})
