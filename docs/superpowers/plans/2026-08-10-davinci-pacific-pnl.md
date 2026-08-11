# Davinci Pacific P&L Implementation Plan

> **For agentic workers:** Execute task-by-task. Prefer TDD where noted.

**Goal:** Pacific midnight periods, three-series P&L chart, reliable Davinci ERP harness on live DB.

**Architecture:** `period.ts` TZ → `finance-service` aggregates/series → UI + ERP tools share same service → Davinci prompt/tools describe schema.

## Task 1: Pacific timezone
- Files: `src/lib/finance/period.ts`, `period.test.ts`
- Change `FINANCE_TIME_ZONE` to `America/Los_Angeles`; update tests.

## Task 2: Cash flow series + ganancia
- Files: `finance-service.ts`
- Add `ganancia` / `gananciaPlot` / `gananciaNegative` to series; expose `ganancia` on cashFlow; Pacific peak hours.

## Task 3: Chart UI
- Files: `finance-periodos-client.tsx`, optionally `finance-client.tsx`
- Egreso gray; ganancia green/red with absolute Y.

## Task 4: Davinci tools + harness
- Files: `erp-tool-ids`, registry, executors, `davinci-agent.ts`
- Add `recent_pos_sales`, `inventory_snapshot`; Pacific copy; schema prompt.

## Task 5: Verify + push
- Run vitest/eslint; deploy.
