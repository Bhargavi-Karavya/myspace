import type { ChatMessage } from '../types/chat'

export const EXAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: 'example-user',
    role: 'user',
    content:
      "I've been postponing system design for months and I'm not sure where to start.",
  },
  {
    id: 'example-model',
    role: 'model',
    content:
      "Let's break it down instead of trying to tackle everything at once. We can start with the fundamentals and build from there.",
  },
]
