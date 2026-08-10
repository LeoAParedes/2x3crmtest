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
