## Task 1: Model authorized workspace navigation

**Files:**
- Create: `src/lib/ui/workspace-navigation.ts`
- Create: `src/lib/ui/workspace-navigation.test.ts`

**Interfaces:**
- Consumes: `CrmRole` from `src/lib/security/rbac.ts`.
- Produces: `getWorkspaceNavigation(role: CrmRole): WorkspaceNavigationItem[]`.

- [ ] **Step 1: Write the failing navigation-policy tests**

```ts
import { describe, expect, it } from 'vitest'

import { getWorkspaceNavigation } from '@/src/lib/ui/workspace-navigation'

describe('getWorkspaceNavigation', () => {
  it('gives administrators their operational destinations', () => {
    expect(getWorkspaceNavigation('admin')).toEqual([
      { href: '/admin', label: 'Panel' },
      { href: '/pos', label: 'Punto de venta' },
      { href: '/crm', label: 'Conversaciones' }
    ])
  })

  it('does not expose administration or conversation logs to cashiers', () => {
    expect(getWorkspaceNavigation('cashier')).toEqual([{ href: '/pos', label: 'Punto de venta' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/ui/workspace-navigation.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure navigation model**

```ts
import type { CrmRole } from '@/src/lib/security/rbac'

export type WorkspaceNavigationItem = {
  href: '/admin' | '/pos' | '/crm'
  label: string
}

const navigationByRole: Record<CrmRole, WorkspaceNavigationItem[]> = {
  admin: [
    { href: '/admin', label: 'Panel' },
    { href: '/pos', label: 'Punto de venta' },
    { href: '/crm', label: 'Conversaciones' }
  ],
  cashier: [{ href: '/pos', label: 'Punto de venta' }]
}

export const getWorkspaceNavigation = (role: CrmRole): WorkspaceNavigationItem[] => navigationByRole[role]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/ui/workspace-navigation.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/workspace-navigation.ts src/lib/ui/workspace-navigation.test.ts
git commit -m "feat(navigation): add role-aware workspace links"
```
