/**
 * Message roles for persisted chat turns.
 * Conversation history only stores user ↔ assistant exchanges.
 */
export const MESSAGE_ROLES = ['user', 'assistant'] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];
