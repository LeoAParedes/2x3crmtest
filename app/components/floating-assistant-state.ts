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
