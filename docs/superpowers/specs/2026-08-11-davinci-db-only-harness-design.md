# DavinciAi DB-only harness

## Goal

DavinciAi must never report figures or operational facts that did not come from live Supabase Postgres (via Prisma ERP tools).

## Rules

1. Business questions require at least one successful ERP tool call before any numeric reply.
2. Every tool fact is stamped with `provenance: { source: 'supabase_postgres', via: 'prisma', queriedAt }`.
3. If OpenAI skips tools or fails, answer with a deterministic formatter over tool facts — never Mastra free-form for ERP metrics.
4. No invented defaults (e.g. hardcoded $50) on the ERP path.

## Components

- `src/lib/ai/erp-db-harness.ts` — intent detection, provenance, snapshot self-check, deterministic reply
- `src/lib/ai/davinci-agent.ts` — `tool_choice: required` for ERP intents
- `src/lib/crm/agent/orchestrator.ts` — skip Mastra inventing path for ERP intents
