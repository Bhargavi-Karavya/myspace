/** Aligns with future POST /api/ai/chat message shape. */
export type MessageRole = 'user' | 'model'

export type ChatMessage = {
  id: string
  role: MessageRole
  content: string
}

export type ChatComposerStatus = 'idle' | 'typing' | 'sending' | 'disabled'
