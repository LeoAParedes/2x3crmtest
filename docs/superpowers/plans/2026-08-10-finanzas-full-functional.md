# Plan: Finanzas Modules — Full Functional

**Date:** 2026-08-10  
**Branch:** main  
**Repo:** g:\Claude\2x3crmtest  

## Audit Findings

### Already DB-backed and working:
- `/finanzas` (overview) — fetches `/api/finanzas/summary` → `getFinanceDashboard()` (Prisma: Sale, Expense, SaleItem)
- `/finanzas/periodos` — charts + custom date range + expense creation (POST `/api/finanzas/expenses`), all DB-persisted
- `/finanzas/fondos` — reads `CashSession` via `/api/caja/session` + `/api/caja/cortes` (real DB)

### Broken / incomplete:
1. **`/finanzas/compras`** — BUG: fetches `/api/inventario?pageSize=200&page=1` which has no route (should be `/api/pos/inventory`). Returns 404. No purchase registration form — only a read-only restock suggestion list.
2. **`/finanzas/pasivo`** — Read-only view of expenses. Missing Create + Delete UI. Pasivo shows category totals but no way to add or remove expenses from this page.
3. **`/finanzas/promociones`** — CRITICAL: 100% hardcoded mock data (`EXAMPLE_PROMOTIONS`). Save button is disabled with "coming soon" message. No DB model, no API routes, no persistence.

## Global Constraints

- Spanish UI throughout; Tailwind only, no inline CSS or extra style tags
- No semicolons in TypeScript/TSX files
- Accessible forms: `aria-label`, `role`, `tabIndex={0}` on interactive elements
- Admin-only finance — RBAC already enforced in all existing API routes via `requireApiAccess`
- Do NOT break POS, inventory, caja modules
- All new Prisma models must include a migration (`prisma/migrations/`)
- Package.json `build` script runs `prisma migrate deploy && next build` — migrations auto-apply on Vercel
- Match inventario patterns: Zod validation, service layer, SystemActionLog, graceful UI errors
- Conventional commits (no secrets, no `.env` values)
- Commit after each task; push to `origin/main` after all tasks

## Tasks

---

### Task 1: Fix Compras — Correct API URL + Add Purchase Registration Form

**Scope:** `app/finanzas/compras/compras-client.tsx` only (no new files needed — the `/api/inventario/ajustes` and `/api/pos/inventory` routes already exist and are fully functional)

**Bug to fix:**
The client calls `fetch('/api/inventario?pageSize=200&page=1')` which returns 404 because no route exists at that path. The correct route is `/api/pos/inventory` (at `app/api/pos/inventory/route.ts`).

**Feature to add:**
A "Registrar compra" form that persists purchase entries to the DB:
1. When user clicks "Registrar compra" on a restock row (or via a standalone form), show a form with:
   - Product (pre-filled from clicked row, or dropdown with all inventory items)
   - Quantity (number, required, integer > 0)
   - Costo unitario (number, required, > 0, MXN)
   - Motivo (text, defaults to "Compra a proveedor", min 3 chars)
   - Optional: "Registrar como gasto" checkbox (defaults checked) — if checked, also POST to `/api/finanzas/expenses` with `{ category: 'proveedores', description: motivo, amount: qty * unitCost, kind: 'operating' }`
2. On submit, POST to `/api/inventario/ajustes` with `{ operation: 'stock_entry', inventoryItemId, quantity, unitCost, reason: motivo }`.
3. On success: close form, show "Compra registrada — stock actualizado" message, reload the restock list.
4. On error: show the error message from the API response under the form.

**Acceptance criteria:**
- `/finanzas/compras` loads without 404 on initial fetch
- "Registrar compra" button per restock-needed row opens a form
- Submitting the form calls `/api/inventario/ajustes` with `stock_entry` and the correct payload
- If "Registrar como gasto" is checked, also calls `/api/finanzas/expenses` POST
- Success reloads the list and the registered item may no longer appear if stock is now above minStock
- Error state shown if API fails (no crash)
- No localStorage, no mock data

**Files to change:**
- `app/finanzas/compras/compras-client.tsx` (fix URL + add form)

**No new API routes needed** — existing routes handle all operations.

---

### Task 2: Pasivo — Add Create + Delete (Expense CRUD)

**Scope:**
- New: `app/api/finanzas/expenses/[id]/route.ts` (DELETE handler)
- New function in: `src/lib/finance/finance-service.ts` (`deleteExpense`)
- Update: `app/finanzas/pasivo/pasivo-client.tsx` (add create form + delete button)

**Backend — DELETE endpoint:**
Create `app/api/finanzas/expenses/[id]/route.ts`:
```
DELETE /api/finanzas/expenses/:id
- requireApiAccess: allowedRoles: ['admin'], requiredPermission: 'finance:view'
- Call deleteExpense(id, actor) from finance service
- Returns: { success: true, message: 'Gasto eliminado' }
- 404 if not found: { success: false, message: 'Gasto no encontrado' }
```

`deleteExpense` in finance-service.ts:
```typescript
export const deleteExpense = async (id: string, actor: AuthenticatedActor) => {
  const prisma = await getPrisma()
  const existing = await prisma.expense.findUnique({ where: { id } })
  if (!existing) throw new Error('EXPENSE_NOT_FOUND')
  await prisma.expense.delete({ where: { id } })
  await prisma.systemActionLog.create({ data: {
    actorAuthUserId: actor.userId, actorUsername: actor.username, actorRole: actor.role,
    action: 'finance.expense.delete', entityType: 'Expense', entityId: id,
    status: 'success', metadata: { category: existing.category, amount: Number(existing.amount) }
  }})
}
```

**Frontend — pasivo-client.tsx updates:**
1. Add "Registrar gasto" inline section (same fields as periodos: tipo, categoría, descripción, monto). POST to `/api/finanzas/expenses`. On success, reload list.
2. Add "Eliminar" (trash icon or button) to each expense row. On click: confirm with `window.confirm('¿Eliminar este gasto?')`, then DELETE `/api/finanzas/expenses/${id}`. On success, reload list and show confirmation message.
3. Keep the existing read-only view, category summaries, and period selector.

**Acceptance criteria:**
- Admin can create an expense from /pasivo and see it appear in the list immediately
- Admin can delete any expense from the list; the row disappears and totals recalculate
- Validation: amount > 0, description min 2 chars
- Error shown if API fails
- SystemActionLog entry created for both create and delete

---

### Task 3: Promociones — Prisma Model + Migration + Service + API Routes

**Scope:** Backend only (no UI changes in this task)
- `prisma/schema.prisma` — add `Promotion` model
- `prisma/migrations/20260810220000_promotions/migration.sql` — migration file
- `src/lib/finance/promotions-schema.ts` — Zod schema
- `src/lib/finance/promotions-service.ts` — service layer
- `app/api/finanzas/promociones/route.ts` — GET + POST
- `app/api/finanzas/promociones/[id]/route.ts` — PATCH + DELETE

**Prisma model to add to schema.prisma:**
```prisma
model Promotion {
  id          String    @id @default(cuid())
  name        String
  /// porcentaje | monto_fijo | 2x1 | bundle
  type        String
  value       Decimal   @db.Decimal(10, 2)
  minPurchase Decimal   @db.Decimal(10, 2) @default(0)
  description String
  active      Boolean   @default(true)
  expiresAt   DateTime?
  createdByUsername String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([active, expiresAt])
}
```

**Migration SQL** (`prisma/migrations/20260810220000_promotions/migration.sql`):
```sql
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "minPurchase" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Promotion_active_expiresAt_idx" ON "Promotion"("active", "expiresAt");
```

**Zod schema** (`src/lib/finance/promotions-schema.ts`):
```typescript
import { z } from 'zod'

export const PROMO_TYPES = ['porcentaje', 'monto_fijo', '2x1', 'bundle'] as const
export type PromoType = (typeof PROMO_TYPES)[number]

export const createPromotionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(PROMO_TYPES),
  value: z.number().nonnegative().max(100_000),
  minPurchase: z.number().nonnegative().max(1_000_000).default(0),
  description: z.string().trim().min(2).max(240),
  active: z.boolean().default(true),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable()
}).strict()

export const updatePromotionSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  type: z.enum(PROMO_TYPES).optional(),
  value: z.number().nonnegative().max(100_000).optional(),
  minPurchase: z.number().nonnegative().max(1_000_000).optional(),
  description: z.string().trim().min(2).max(240).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable()
}).strict()

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>
```

**Service** (`src/lib/finance/promotions-service.ts`):
- `listPromotions()` — findMany, ordered by active desc, createdAt desc
- `createPromotion(input, actor)` — validate with createPromotionSchema, create in DB, write SystemActionLog
- `updatePromotion(id, input, actor)` — validate with updatePromotionSchema, update in DB, write SystemActionLog
- `deletePromotion(id, actor)` — check exists, delete, write SystemActionLog

**API routes:**
- `GET /api/finanzas/promociones` — list all promotions (admin only, `finance:view`)
- `POST /api/finanzas/promociones` — create promotion (admin only, `finance:view`)
- `PATCH /api/finanzas/promociones/[id]` — update/toggle active (admin only, `finance:view`)
- `DELETE /api/finanzas/promociones/[id]` — delete promotion (admin only, `finance:view`)

All follow the same pattern as `app/api/finanzas/expenses/route.ts`: `requireApiAccess`, try/catch, ZodError → 422, service errors → 503.

**Run migration:** After writing files, run `npx prisma migrate dev --name promotions` (or write the migration SQL manually to the migrations directory and run `npx prisma generate`).

**Acceptance criteria:**
- `Promotion` model exists in schema.prisma
- Migration SQL file exists and runs without error
- `npx prisma generate` succeeds
- GET `/api/finanzas/promociones` returns `{ success: true, promotions: [] }` (or list if any exist)
- POST creates a promotion and returns it
- PATCH toggles active
- DELETE removes it and logs to SystemActionLog

---

### Task 4: Promociones — Full CRUD UI

**Scope:** `app/finanzas/promociones/promociones-client.tsx` — full rewrite

**Replace** the current mock-data implementation with a real DB-backed UI.

**State shape:**
```typescript
type Promotion = {
  id: string; name: string; type: PromoType; value: number
  minPurchase: number; description: string; active: boolean; expiresAt: string | null
  createdByUsername: string; createdAt: string
}
```

**Behavior:**
1. On mount: `GET /api/finanzas/promociones` → populate list, refresh every 30s
2. Summary cards: active count, inactive count, total count (calculated from list)
3. "Nueva promoción" button toggles inline create form with fields:
   - Nombre (text, required, min 2)
   - Tipo (select: porcentaje/monto_fijo/2x1/bundle)
   - Valor (number, for `porcentaje` show %, else show $)
   - Compra mínima (number, optional, default 0)
   - Descripción (text, required, min 2)
   - Activa (checkbox, default true)
   - Expira (date input, optional)
   - Submit: POST to `/api/finanzas/promociones`; on success: close form, reload list, show success message
4. Each row in the table has:
   - Toggle active button: PATCH `/api/finanzas/promociones/${id}` with `{ active: !current }`
   - Delete button: `window.confirm`, then DELETE `/api/finanzas/promociones/${id}`, then reload list
5. Error and success messages with `aria-live`
6. Remove the "La persistencia estará disponible..." amber warning message
7. Remove all hardcoded `EXAMPLE_PROMOTIONS`

**Acceptance criteria:**
- No mock data anywhere in the component
- Create form posts to DB and the new promotion appears in the list
- Toggle active works and persists
- Delete removes from DB and from the list
- Error states render correctly (API down, validation failure)
- Loading skeleton while fetching

---

### Task 5: Commit + Push All Changes to origin/main

**Scope:** Git operations only

1. Run `npx prisma generate` to verify schema compiles
2. Run `npx tsc --noEmit` to verify no TypeScript errors
3. Run `npx vitest run` to verify tests still pass
4. `git add -A`
5. Commit with message:
   ```
   feat(finanzas): make all finance modules fully functional with DB persistence
   
   - Fix compras: correct API URL bug (404) and add purchase registration form
     that creates stock_entry movements and optionally records expense
   - Pasivo: add expense create form and delete (with confirmation) on each row;
     new DELETE /api/finanzas/expenses/[id] endpoint + deleteExpense service fn
   - Promociones: add Promotion Prisma model, migration, full CRUD API routes
     (/api/finanzas/promociones and /[id]), and replace hardcoded mock UI with
     live DB-backed CRUD client
   - All SystemActionLog entries added; Zod validation on all new inputs
   ```
6. `git push origin main`
7. Verify push succeeded

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0
- `npx vitest run` all tests pass (same count as before — no regressions)
- `git push` succeeds
- Report: commit hash + push result
