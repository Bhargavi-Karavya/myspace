export type ConversationPreview = {
  id: string
  title: string
  preview: string
  updatedAt: string
  tone?: 'reflection' | 'planning' | 'clarity'
}

export const SAMPLE_CONVERSATIONS: ConversationPreview[] = [
  {
    id: 'c1',
    title: 'System design paralysis',
    preview:
      "I've been postponing system design for months and I'm not sure where to start.",
    updatedAt: 'Today',
    tone: 'clarity',
  },
  {
    id: 'c2',
    title: 'Reflecting on the week',
    preview:
      'I felt scattered this week. Work took over, and I barely checked in with myself.',
    updatedAt: 'Yesterday',
    tone: 'reflection',
  },
  {
    id: 'c3',
    title: 'What to do next',
    preview:
      'I have three directions open, but I keep circling instead of choosing one.',
    updatedAt: 'Mon',
    tone: 'planning',
  },
  {
    id: 'c4',
    title: 'Organizing scattered notes',
    preview:
      'Everything is living in different places. I want one calm thread to hold it.',
    updatedAt: 'Sun',
    tone: 'clarity',
  },
]
