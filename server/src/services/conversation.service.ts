/**
 * Chat persistence — conversations + messages.
 * Separates DB chat history from long-term memories.
 * All operations are scoped to the authenticated Neon Auth user id.
 */
import type { MessageRole } from '../chat/message-roles.js';
import {
  deleteConversationByIdAndUserId,
  findConversationByIdAndUserId,
  insertConversation,
  insertMessage,
  listMessagesByConversationId,
  listRecentConversationsByUserId,
  setConversationTitleIfEmpty,
  touchConversationUpdatedAt,
  updateConversationTitle,
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

export async function createConversation(input: {
  userId: string;
  title?: string | null;
}): Promise<ConversationRecord> {
  return insertConversation({
    userId: input.userId,
    title: input.title ?? null,
  });
}

export async function getConversation(
  id: string,
  userId: string,
): Promise<ConversationRecord> {
  const conversation = await findConversationByIdAndUserId(id, userId);
  if (!conversation) {
    throw new ConversationNotFoundError(id);
  }
  return conversation;
}

export async function getConversationWithMessages(
  id: string,
  userId: string,
): Promise<{
  conversation: ConversationRecord;
  messages: MessageRecord[];
}> {
  const conversation = await getConversation(id, userId);
  const messages = await listMessagesByConversationId(id);
  return { conversation, messages };
}

export async function getRecentConversations(
  userId: string,
  limit = 50,
): Promise<ConversationPreviewRecord[]> {
  return listRecentConversationsByUserId(userId, limit);
}

export async function deleteConversation(
  id: string,
  userId: string,
): Promise<void> {
  const deleted = await deleteConversationByIdAndUserId(id, userId);
  if (!deleted) {
    throw new ConversationNotFoundError(id);
  }
}

export async function renameConversation(
  id: string,
  userId: string,
  title: string,
): Promise<ConversationRecord> {
  const trimmed = title.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    throw new Error('Conversation title is required');
  }

  const updated = await updateConversationTitle(
    id,
    userId,
    truncateConversationTitle(trimmed),
  );
  if (!updated) {
    throw new ConversationNotFoundError(id);
  }
  return updated;
}

/**
 * Persist one completed chat turn (latest user message + assistant reply).
 * Creates a conversation when conversationId is omitted.
 * Ownership is enforced: existing conversations must belong to userId.
 */
export async function persistChatTurn(input: {
  userId: string;
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
    const existing = await findConversationByIdAndUserId(
      conversationId,
      input.userId,
    );
    if (!existing) {
      throw new ConversationNotFoundError(conversationId);
    }
  } else {
    const created = await insertConversation({
      userId: input.userId,
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
    input.userId,
    truncateConversationTitle(userContent),
  );
  await touchConversationUpdatedAt(conversationId, input.userId);

  return { conversationId };
}
