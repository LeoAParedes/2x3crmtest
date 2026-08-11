## Task 2: Build the floating assistant state boundary

**Files:**
- Create: `app/components/floating-assistant-state.ts`
- Create: `app/components/floating-assistant-state.test.ts`

**Interfaces:**
- Produces: `createFloatingAssistantSessionId()`, `appendMessage()`, and `FloatingAssistantMessage`.
- Consumed by: `app/components/floating-assistant.tsx`.

- [ ] **Step 1: Write the failing pure-state tests**

```ts
import { describe, expect, it } from 'vitest'

import { appendMessage, type FloatingAssistantMessage } from '@/app/components/floating-assistant-state'

describe('appendMessage', () => {
  it('adds a display-safe assistant message without technical metadata', () => {
    const messages: FloatingAssistantMessage[] = [{ id: 'one', role: 'user', content: '¿Hay arroz?' }]

    expect(appendMessage(messages, { id: 'two', role: 'assistant', content: 'Hay 18 unidades disponibles.' })).toEqual([
      { id: 'one', role: 'user', content: '¿Hay arroz?' },
      { id: 'two', role: 'assistant', content: 'Hay 18 unidades disponibles.' }
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/components/floating-assistant-state.test.ts`

Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Implement the state helpers**

```ts
export type FloatingAssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export const createFloatingAssistantSessionId = () => `workspace-${crypto.randomUUID()}`

export const appendMessage = (
  messages: FloatingAssistantMessage[],
  message: FloatingAssistantMessage
): FloatingAssistantMessage[] => [...messages, message]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- app/components/floating-assistant-state.test.ts`

Expected: PASS with 1 test.

- [ ] **Step 5: Commit**

```bash
git add app/components/floating-assistant-state.ts app/components/floating-assistant-state.test.ts
git commit -m "feat(chat): add floating assistant state helpers"
```
