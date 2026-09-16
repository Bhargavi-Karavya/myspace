export type ContextItem = {
  id: string
  label: string
  detail: string
  category: 'values' | 'goals' | 'patterns' | 'notes'
}

export const SAMPLE_CONTEXT: ContextItem[] = [
  {
    id: 'x1',
    label: 'Prefer calm clarity over quick answers',
    detail:
      'When stuck, it helps to slow down and name the real question before solving.',
    category: 'values',
  },
  {
    id: 'x2',
    label: 'Learning system design steadily',
    detail:
      'Not cramming. Building confidence through small, consistent sessions.',
    category: 'goals',
  },
  {
    id: 'x3',
    label: 'Avoids starting when the task feels huge',
    detail:
      'Large open-ended work often gets postponed until the first step feels safe.',
    category: 'patterns',
  },
  {
    id: 'x4',
    label: 'Evening reflection works best',
    detail:
      'Short end-of-day check-ins help close loops and reduce leftover mental noise.',
    category: 'notes',
  },
]

export const CONTEXT_CATEGORY_LABELS: Record<ContextItem['category'], string> = {
  values: 'Values',
  goals: 'Goals',
  patterns: 'Patterns',
  notes: 'Notes',
}
