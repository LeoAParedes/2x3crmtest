# DavinciAi Semantic Sales and Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let DavinciAi interpret natural Spanish product, date, and sales/inventory questions and return concise, customer-facing answers strictly grounded in Supabase/Postgres facts.

**Architecture:** Add a validated semantic-query contract and planner before the existing whitelisted read tools. Resolve product names to actual `InventoryItem` rows, execute a bounded Prisma-only sales/inventory read plan, normalize facts, then compose a business answer that hides infrastructure and tool vocabulary.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, Supabase Postgres, Zod, Vitest, OpenAI Chat Completions.

## Global Constraints

- Read-only DB access: no raw SQL, no writes, no user-supplied query expressions.
- Numeric or operational facts must originate in Prisma read functions.
- Use `America/Los_Angeles` for business dates.
- Do not expose `Supabase`, `Postgres`, `Prisma`, schema/table names, tool IDs, provenance, or internal reasoning to customers.
- Product ambiguity must produce a concise clarification instead of a guessed product.
- Keep the existing Twilio webhook under its 60-second maximum duration.
- Preserve the current deterministic fallback when the semantic planner is unavailable.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/ai/semantic-query.ts` | Zod contracts, deterministic phrase/date parsing, and safe plan normalization. |
| `src/lib/ai/semantic-query.test.ts` | Unit coverage for Spanish intent/date/product parsing and validation. |
| `src/lib/ai/product-read-service.ts` | Prisma-only product resolution and product sales/stock fact queries. |
| `src/lib/ai/product-read-service.test.ts` | Tests for resolver ranking, ambiguity, and normalized facts. |
| `src/lib/ai/semantic-read-executor.ts` | Converts a validated semantic query into a bounded execution plan and customer-ready business facts. |
| `src/lib/ai/semantic-read-executor.test.ts` | End-to-end semantic-plan execution tests with mocked read functions. |
| `src/lib/ai/customer-answer-composer.ts` | Formats business facts into concise Spanish without technical source text. |
| `src/lib/ai/customer-answer-composer.test.ts` | Ensures customer output has no internal provenance labels and handles clarifications. |
| `src/lib/ai/davinci-agent.ts` | Calls semantic planning/execution before generic OpenAI ERP tool loops. |
| `src/lib/crm/agent/orchestrator.ts` | Uses semantic executor for WhatsApp ERP questions instead of the keyword-only deterministic formatter. |
| `src/lib/ai/erp-db-harness.ts` | Retains generic fallback; delegates product/date paths to semantic execution where applicable. |

## Task 1: Semantic query contract and deterministic date parsing

**Files:**
- Create: `src/lib/ai/semantic-query.ts`
- Create: `src/lib/ai/semantic-query.test.ts`

**Interfaces:**
- Produces `SemanticReadQuery`, `semanticReadQuerySchema`, `parseDeterministicSemanticQuery(message, now?)`, and `normalizeSemanticQuery(value)`.
- Consumes `BusinessDateMention` and `FINANCE_TIME_ZONE` from `src/lib/ai/erp-db-harness.ts` / `src/lib/finance/period.ts`.

- [ ] **Step 1: Write failing parsing tests**

```ts
import { describe, expect, it } from 'vitest'

import { parseDeterministicSemanticQuery } from '@/src/lib/ai/semantic-query'

describe('parseDeterministicSemanticQuery', () => {
  it('extracts a product sales and stock request for last week', () => {
    expect(
      parseDeterministicSemanticQuery('Cuántos aguacates se vendieron la semana pasada y cuánto queda?')
    ).toMatchObject({
      intent: 'product_sales_and_stock',
      productQuery: 'aguacates',
      dateRange: { kind: 'previous_week' },
      metrics: ['quantity', 'stock']
    })
  })

  it('extracts an explicit product sales date', () => {
    expect(parseDeterministicSemanticQuery('Ventas de leche el 10 de agosto')).toMatchObject({
      intent: 'product_sales',
      productQuery: 'leche',
      dateRange: { kind: 'explicit_date', date: '2026-08-10' }
    })
  })
})
```

- [ ] **Step 2: Run the new test**

Run: `npm test -- src/lib/ai/semantic-query.test.ts`

Expected: FAIL because `semantic-query.ts` does not exist.

- [ ] **Step 3: Implement the contract and parser**

```ts
export const semanticIntentSchema = z.enum([
  'product_sales',
  'product_stock',
  'product_sales_and_stock',
  'sales_summary',
  'inventory_summary',
  'cash_flow_summary',
  'clarify'
])

export const semanticReadQuerySchema = z.object({
  intent: semanticIntentSchema,
  productQuery: z.string().min(1).max(120).optional(),
  dateRange: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('today') }),
    z.object({ kind: z.literal('yesterday') }),
    z.object({ kind: z.literal('week') }),
    z.object({ kind: z.literal('previous_week') }),
    z.object({ kind: z.literal('month') }),
    z.object({ kind: z.literal('rolling_days'), days: z.number().int().min(1).max(90) }),
    z.object({ kind: z.literal('explicit_date'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  ]),
  metrics: z.array(z.enum(['quantity', 'revenue', 'stock', 'low_stock', 'ticket_count'])).min(1).max(3)
})
```

Implement phrase recognition for `hoy`, `ayer`, `esta semana`, `la semana pasada`, `este mes`, `últimos N días`, and explicit Spanish dates. Extract the product phrase only after removing recognized metric/date phrases; return `clarify` if no product remains for product intents.

- [ ] **Step 4: Run parser tests**

Run: `npm test -- src/lib/ai/semantic-query.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/semantic-query.ts src/lib/ai/semantic-query.test.ts
git commit -m "feat(davinci): parse semantic sales and inventory queries"
```

## Task 2: Product resolver and product-sales facts

**Files:**
- Create: `src/lib/ai/product-read-service.ts`
- Create: `src/lib/ai/product-read-service.test.ts`

**Interfaces:**
- Produces `resolveProduct`, `getProductSalesFacts`, `getProductStockFacts`.
- Consumes `InventoryItem`, `SaleItem`, `Sale.status=completed`, and resolved date bounds.
- Produces `ProductResolution` with `resolved`, `ambiguous`, or `not_found` status.

- [ ] **Step 1: Write failing resolver and sales-facts tests**

```ts
it('returns an exact normalized product match before partial matches', async () => {
  const result = await resolveProduct('aguacate hass')
  expect(result).toMatchObject({
    status: 'resolved',
    item: { sku: 'AGU-HASS', productName: 'Aguacate Hass' }
  })
})

it('reports ambiguity instead of choosing between equivalent candidates', async () => {
  const result = await resolveProduct('leche')
  expect(result).toMatchObject({ status: 'ambiguous' })
})

it('counts only completed sale items for the resolved product and date range', async () => {
  const facts = await getProductSalesFacts('inventory-item-id', range)
  expect(facts).toEqual({ quantity: 12, revenue: 348, ticketCount: 4 })
})
```

- [ ] **Step 2: Run the new test**

Run: `npm test -- src/lib/ai/product-read-service.test.ts`

Expected: FAIL because product read functions do not exist.

- [ ] **Step 3: Implement Prisma-only resolver and fact readers**

Use `getPrisma()` and `findMany` with bounded candidate limits:

```ts
const candidates = await prisma.inventoryItem.findMany({
  where: {
    OR: [
      { sku: { equals: normalizedQuery, mode: 'insensitive' } },
      { productName: { equals: normalizedQuery, mode: 'insensitive' } },
      { sku: { contains: normalizedQuery, mode: 'insensitive' } },
      { productName: { contains: normalizedQuery, mode: 'insensitive' } }
    ]
  },
  orderBy: [{ productName: 'asc' }],
  take: 4,
  select: { id: true, sku: true, productName: true, category: true, stock: true, minStock: true }
})
```

For sales facts, query `SaleItem` constrained by:

```ts
where: {
  inventoryItemId,
  sale: {
    status: 'completed',
    createdAt: { gte: range.start, lte: range.end }
  }
}
```

Aggregate quantity/revenue/ticket IDs in TypeScript so unit and ticket counts remain explicit. Return stock directly from the resolved `InventoryItem`.

- [ ] **Step 4: Run product read tests**

Run: `npm test -- src/lib/ai/product-read-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/product-read-service.ts src/lib/ai/product-read-service.test.ts
git commit -m "feat(davinci): add product sales and stock readers"
```

## Task 3: Semantic read executor and bounded multi-step plans

**Files:**
- Create: `src/lib/ai/semantic-read-executor.ts`
- Create: `src/lib/ai/semantic-read-executor.test.ts`
- Modify: `src/lib/finance/period.ts`

**Interfaces:**
- Consumes `SemanticReadQuery`, `resolveProduct`, `getProductSalesFacts`, `getProductStockFacts`.
- Produces `SemanticReadResult`:

```ts
type SemanticReadResult =
  | { status: 'answered'; query: SemanticReadQuery; facts: BusinessFact[] }
  | { status: 'clarify_product'; candidates: Array<{ sku: string; productName: string }> }
  | { status: 'not_found'; productQuery: string }
```

- [ ] **Step 1: Write failing executor tests**

```ts
it('executes sales plus stock using one resolved product', async () => {
  const result = await executeSemanticReadQuery({
    intent: 'product_sales_and_stock',
    productQuery: 'aguacate hass',
    dateRange: { kind: 'previous_week' },
    metrics: ['quantity', 'stock']
  })

  expect(result).toMatchObject({
    status: 'answered',
    facts: expect.arrayContaining([
      expect.objectContaining({ kind: 'product_sales' }),
      expect.objectContaining({ kind: 'product_stock' })
    ])
  })
})
```

- [ ] **Step 2: Run the executor test**

Run: `npm test -- src/lib/ai/semantic-read-executor.test.ts`

Expected: FAIL because `executeSemanticReadQuery` does not exist.

- [ ] **Step 3: Implement date-range resolution and execution**

Add an exported resolver in `src/lib/finance/period.ts`:

```ts
export const getPreviousWeekBounds = (now = new Date(), timeZone = FINANCE_TIME_ZONE) => {
  const currentWeek = getPeriodBounds('week', now, timeZone)
  const previousEnd = new Date(currentWeek.start.getTime() - 1000)
  const previousStart = new Date(currentWeek.start.getTime() - 7 * 24 * 60 * 60 * 1000)
  return { start: previousStart, end: previousEnd }
}
```

In the executor, map each validated `dateRange.kind` to an existing or new bounds function. Resolve the product before sales/stock reads. Do not call more than two product readers for one product request. Return structured facts only; no customer text.

- [ ] **Step 4: Run executor tests**

Run: `npm test -- src/lib/ai/semantic-read-executor.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/semantic-read-executor.ts src/lib/ai/semantic-read-executor.test.ts src/lib/finance/period.ts
git commit -m "feat(davinci): execute bounded semantic read plans"
```

## Task 4: Customer answer composer

**Files:**
- Create: `src/lib/ai/customer-answer-composer.ts`
- Create: `src/lib/ai/customer-answer-composer.test.ts`

**Interfaces:**
- Consumes `SemanticReadResult`.
- Produces `composeCustomerAnswer(result): string`.

- [ ] **Step 1: Write failing customer-language tests**

```ts
it('answers product sales and stock without technical source labels', () => {
  const answer = composeCustomerAnswer(answeredProductSalesAndStockResult)

  expect(answer).toContain('Aguacate Hass')
  expect(answer).toContain('se vendieron 12')
  expect(answer).toContain('quedan 9')
  expect(answer).not.toMatch(/supabase|postgres|prisma|tool|saleitem/i)
})

it('asks for clarification with no more than three candidates', () => {
  expect(composeCustomerAnswer(ambiguousMilkResult)).toBe(
    'Encontré varios productos: Leche Entera 1L (LEC-ENT-1L), Leche Deslactosada 1L (LEC-DES-1L). ¿Cuál buscas?'
  )
})
```

- [ ] **Step 2: Run composer tests**

Run: `npm test -- src/lib/ai/customer-answer-composer.test.ts`

Expected: FAIL because the composer does not exist.

- [ ] **Step 3: Implement concise Spanish composition**

Use deterministic templates by fact kind:

```ts
return `Del ${periodLabel}, se vendieron ${quantityLabel} de ${productName}. Ingresaron $${revenue.toFixed(2)} y quedan ${stockLabel}.`
```

Only include revenue when requested or when it materially answers the user’s question. For zero sales, state `No registré ventas de ${productName} en ${periodLabel}.` Never append provenance/source text.

- [ ] **Step 4: Run composer tests**

Run: `npm test -- src/lib/ai/customer-answer-composer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/customer-answer-composer.ts src/lib/ai/customer-answer-composer.test.ts
git commit -m "feat(davinci): compose customer-facing semantic answers"
```

## Task 5: Wire semantic execution into DavinciAi and WhatsApp

**Files:**
- Modify: `src/lib/crm/agent/orchestrator.ts:264-307`
- Modify: `src/lib/ai/davinci-agent.ts:103-235`
- Modify: `src/lib/ai/erp-db-harness.ts:160-373`
- Modify: `src/lib/ai/erp-db-harness.test.ts`

**Interfaces:**
- Consumes `parseDeterministicSemanticQuery`, `executeSemanticReadQuery`, `composeCustomerAnswer`.
- Produces a `ChatReply` with `intent: 'erp_metrics'`, semantic action IDs, and customer-only text.

- [ ] **Step 1: Write integration tests for the router**

```ts
it('uses semantic execution for a WhatsApp product question', async () => {
  const reply = await runCrmAgent({
    channel: 'whatsapp',
    sessionId: 'test',
    message: 'Cuántos aguacates se vendieron la semana pasada y cuánto queda?',
    locale: 'es-MX',
    metadata: {}
  })

  expect(reply.reply).toMatch(/aguacate/i)
  expect(reply.reply).not.toMatch(/supabase|postgres|prisma|tool/i)
  expect(reply.actions).toEqual(expect.arrayContaining(['erp.semantic.product_sales_and_stock']))
})
```

- [ ] **Step 2: Run integration test**

Run: `npm test -- src/lib/ai/semantic-read-executor.test.ts src/lib/ai/customer-answer-composer.test.ts`

Expected: FAIL until the orchestrator delegates semantic product/date questions.

- [ ] **Step 3: Add semantic-first routing**

In `runCrmAgent`, before the current WhatsApp deterministic fallback:

```ts
const semanticQuery = parseDeterministicSemanticQuery(message.message)
if (semanticQuery) {
  const semanticResult = await executeSemanticReadQuery(semanticQuery)
  return applyReplyPolicy({
    reply: composeCustomerAnswer(semanticResult),
    intent: 'erp_metrics',
    actions: [`erp.semantic.${semanticQuery.intent}`],
    runMode: 'fallback'
  }, settings)
}
```

In `runDavinciErpAgent`, execute the same semantic route for product/date-specific questions before the generic OpenAI loop. Keep the generic whitelisted tools only for queries the semantic parser cannot classify.

Remove the source line from `formatDeterministicErpReply`:

```ts
// Delete:
lines.push('Fuente: Supabase Postgres (Sale/Expense/InventoryItem).')
```

Replace generic technical labels with customer wording while retaining the fallback's facts.

- [ ] **Step 4: Add runtime instrumentation**

Keep the existing debug instrumentation. Add one folded log at semantic execution exit:

```ts
// #region agent log
fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'449600'},body:JSON.stringify({sessionId:'449600',runId:'semantic-read',hypothesisId:'H9',location:'src/lib/ai/semantic-read-executor.ts:executeSemanticReadQuery',message:'semantic query executed',data:{intent:query.intent,rangeKind:query.dateRange.kind,resolution:resolution.status,factKinds:facts.map(fact=>fact.kind)},timestamp:Date.now()})}).catch(()=>{})
// #endregion
```

Do not log the raw user message, phone number, token, or customer identity.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
npm test -- src/lib/ai/semantic-query.test.ts src/lib/ai/product-read-service.test.ts src/lib/ai/semantic-read-executor.test.ts src/lib/ai/customer-answer-composer.test.ts
npx tsc --noEmit
npx eslint src/lib/ai/semantic-query.ts src/lib/ai/product-read-service.ts src/lib/ai/semantic-read-executor.ts src/lib/ai/customer-answer-composer.ts src/lib/ai/davinci-agent.ts src/lib/crm/agent/orchestrator.ts --max-warnings=0
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai src/lib/crm/agent/orchestrator.ts src/lib/finance/period.ts
git commit -m "feat(davinci): add semantic sales and inventory reasoning"
```

## Task 6: Production verification

**Files:**
- Modify: `scripts/verify-davinci-db-harness.ts`

**Interfaces:**
- Consumes the semantic executor and customer answer composer.
- Produces redacted semantic execution observations in `debug-449600.log`.

- [ ] **Step 1: Add a product-and-date runtime scenario**

```ts
const semantic = await executeSemanticReadQuery(
  parseDeterministicSemanticQuery('Cuántos aguacates se vendieron la semana pasada y cuánto queda?')!
)
const answer = composeCustomerAnswer(semantic)
```

Write only `intent`, `resolution.status`, fact kinds, and whether the answer contains forbidden technical terms. Do not write product/customer identifiers if they are not needed for debugging.

- [ ] **Step 2: Clear the debug log and run verification**

Run:

```bash
npx tsx -r dotenv/config scripts/verify-davinci-db-harness.ts
```

Expected: semantic execution facts and a customer-facing answer with no source labels.

- [ ] **Step 3: Verify through production WhatsApp**

After deployment, send:

```text
¿Cuántos aguacates se vendieron la semana pasada y cuánto queda?
```

Expected: one concise answer that resolves a product or asks a clarification; it must not mention Supabase, Postgres, Prisma, tool names, or source text.

- [ ] **Step 4: Commit verification script update**

```bash
git add scripts/verify-davinci-db-harness.ts
git commit -m "test(davinci): verify semantic customer responses"
```

## Self-Review

- Scope coverage: product/date interpretation, sales facts, stock facts, concise client wording, ambiguity, bounded read-only plans, runtime proof, and no technical source labels are mapped to Tasks 1–6.
- Deferred scope: purchases, suppliers, cash sessions, promotions, CRM balances, and margins are deliberately excluded and require a separate plan because each needs additional facts and tools.
- Type consistency: `SemanticReadQuery` is produced in Task 1, consumed in Task 3, and routed in Task 5. `SemanticReadResult` is produced in Task 3 and consumed in Tasks 4–6.
- Placeholder scan: no implementation task delegates undefined behavior; all data access and expected test behavior are specified.

