# Plan: Lotes, promos, caja, dashboard

> **For agentic workers:** Implement by section; commit + push after each section passes lint/typecheck/tests.

**Goal:** Deliver the approved design in `docs/superpowers/specs/2026-08-11-lotes-promos-caja-dashboard-design.md`.

**Architecture:** Prisma/Supabase lots + expiry alerts; promo engine at POS; shift windows on CashSession; credit payment fields; admin hub dashboard.

**Tech Stack:** Next.js 16, Prisma 7, Zod, Vitest, Tailwind.

## Global Constraints

- Read/write via Prisma only; business TZ `America/Los_Angeles`
- No localStorage as source of truth for expiry
- FEFO merma from specific lot
- Auto promos; greatest savings; bundle with qty per SKU
- One cash close per shift slot
- Credit requires name + phone
- Dashboard hub must not duplicate finance screens
- Commit + push per completed section after green checks

---

### Section 1: Inventory lots + alerts + merma
### Section 2: Promotions engine + POS + finance
### Section 3: Cash shift windows
### Section 4: Credit payment + payment method metrics
### Section 5: Dashboard hub
### Section 6: User manual update
