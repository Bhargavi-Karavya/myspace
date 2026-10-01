/**
 * Chat persistence — conversations + messages.
 * Separates DB chat history from long-term memories.
 */
import type { MessageRole } from '../chat/message-roles.js';
import {
  findConversationById,
  insertConversation,
  insertMessage,
  listMessagesByConversationId,
  listRecentConversations,
  setConversationTitleIfEmpty,
  touchConversationUpdatedAt,
  type ConversationPreviewRecord,
  type ConversationRecord,
  type MessageRecord,
} from '../repositories/conversation.repository.js';

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation not found: ${id}`);
    this.name = 'ConversationNotFoundError';
  }
}

const TITLE_MAX_LENGTH = 80;

export function truncateConversationTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= TITLE_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

/** Map API/UI chat role → DB message_role. */
export function toDbMessageRole(
  role: 'user' | 'model' | 'assistant',
): MessageRole {
  if (role === 'model' || role === 'assistant') {
    return 'assistant';
  }
  return 'user';
}

/** Map DB message_role → API/UI chat role. */
export function toApiMessageRole(
  role: MessageRole,
): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

export async function createConversation(input?: {
  title?: string | null;
}): Promise<ConversationRecord> {
  return insertConversation({ title: input?.title ?? null });
}

export async function getConversation(
  id: string,
): Promise<ConversationRecord> {
  const conversation = await findConversationById(id);
  if (!conversation) {
    throw new ConversationNotFoundError(id);
  }
  return conversation;
}

export async function getConversationWithMessages(id: string): Promise<{
  conversation: ConversationRecord;
  messages: MessageRecord[];
}> {
  const conversation = await getConversation(id);
  const messages = await listMessagesByConversationId(id);
  return { conversation, messages };
}

export async function getRecentConversations(
  limit = 50,
): Promise<ConversationPreviewRecord[]> {
  return listRecentConversations(limit);
}

/**
 * Persist one completed chat turn (latest user message + assistant reply).
 * Creates a conversation when conversationId is omitted.
 */
export async function persistChatTurn(input: {
  conversationId?: string;
  userContent: string;
  assistantContent: string;
}): Promise<{ conversationId: string }> {
  const userContent = input.userContent.trim();
  const assistantContent = input.assistantContent.trim();

  if (!userContent || !assistantContent) {
    throw new Error('Both user and assistant content are required to persist');
  }

  let conversationId = input.conversationId;

  if (conversationId) {
    const existing = await findConversationById(conversationId);
    if (!existing) {
      throw new ConversationNotFoundError(conversationId);
    }
  } else {
    const created = await insertConversation({
      title: truncateConversationTitle(userContent),
    });
    conversationId = created.id;
  }

  await insertMessage({
    conversationId,
    role: 'user',
    content: userContent,
  });
  await insertMessage({
    conversationId,
    role: 'assistant',
    content: assistantContent,
  });

  await setConversationTitleIfEmpty(
    conversationId,
    truncateConversationTitle(userContent),
  );
  await touchConversationUpdatedAt(conversationId);

  return { conversationId };
}
