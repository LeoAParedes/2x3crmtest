# DavinciAi Semantic Read Layer

## Objective

Make DavinciAi understand business questions in natural Spanish, resolve products and dates against live data, execute only approved read queries, and return short customer-facing answers without exposing database or tool internals.

## Scope: phase 1

Phase 1 covers POS sales and inventory:

- Product-specific sales quantity and revenue.
- Product-specific current stock and low-stock status.
- Natural date expressions: today, yesterday, explicit date, last week, current week, current month, and rolling last N days.
- Ambiguous product handling: request clarification instead of guessing.
- Customer response composition with business wording only.

Purchases, suppliers, cash sessions, promotions, customer balances, and cross-module margin analysis are separate follow-on phases. The models exist but are not queryable by the ERP harness today.

## Architecture

```text
Message
  -> semantic planner (validated intent/product/date/metric)
  -> entity resolver (InventoryItem candidates)
  -> read plan executor (Prisma-only query functions)
  -> normalized business facts
  -> customer answer composer
```

The planner may select a bounded read plan but never receives raw SQL. All data comes from Prisma functions that apply fixed status and date constraints. If the planner fails, a deterministic fallback handles explicit dates and basic sales/inventory questions; otherwise the assistant asks one concise clarification.

## Contracts

### Semantic query

```ts
type SemanticReadQuery = {
  intent:
    | 'product_sales'
    | 'product_stock'
    | 'sales_summary'
    | 'inventory_summary'
    | 'cash_flow_summary'
  productQuery?: string
  dateRange: {
    kind: 'today' | 'yesterday' | 'week' | 'month' | 'rolling_days' | 'explicit_date'
    days?: number
    date?: string
  }
  metrics: Array<'quantity' | 'revenue' | 'stock' | 'low_stock' | 'ticket_count'>
}
```

### Resolver result

```ts
type ProductResolution =
  | { status: 'resolved'; item: { id: string; sku: string; productName: string; category: string } }
  | { status: 'ambiguous'; candidates: Array<{ sku: string; productName: string }> }
  | { status: 'not_found' }
```

### Response policy

- Never include `Supabase`, `Postgres`, `Prisma`, table names, tool names, provenance stamps, or internal date boundaries.
- State the interpreted period in customer terms.
- Mention no quantity or amount unless present in normalized facts.
- If a product resolves ambiguously, ask the user to select from at most three names/SKUs.

## Acceptance examples

| Question | Expected behavior |
|---|---|
| “¿Cuántos aguacates se vendieron?” | Resolve aguacate; use latest relevant completed sales period or ask for period if no default is suitable. |
| “¿Cuántos aguacates se vendieron la semana pasada y cuánto queda?” | Resolve one product, calculate sales over the prior natural week, read current inventory stock, answer both facts concisely. |
| “¿Qué se vendió más ayer?” | Resolve yesterday in America/Los_Angeles and query top product facts. |
| “¿Cuánto queda de leche?” | Resolve product and read only current stock. |
| “¿Cuánto vendimos el 10 de agosto?” | Query completed sales for the exact local date. |

