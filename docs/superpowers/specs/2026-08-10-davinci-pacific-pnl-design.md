# DavinciAi + Finanzas Pacific P&L

## Goals
- Timezone `America/Los_Angeles`; calendar day from 00:00 local.
- P&L: ingresos (POS completed sales) − egresos (all expenses) = ganancia.
- Chart: ingresos, egresos (gray), ganancia (green if ≥0, red if &lt;0 with |y|).
- DavinciAi tools query live Prisma; clear schema-aware harness; efficient aggregates.
- Tools cover POS sales, inventory counts/SKUs, stock alerts, finance summary.

## Non-goals
- Separate fixed vs operating neto (rejected; option B).
- COGS / purchase cost margins.
- Raw SQL for the model.
