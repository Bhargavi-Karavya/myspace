import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  conversations,
  messages,
  type ConversationRow,
  type MessageRow,
} from '../db/schema/conversations.js';
import type { MessageRole } from '../chat/message-roles.js';

export type ConversationRecord = {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
};

export type ConversationPreviewRecord = ConversationRecord & {
  /** Latest message content snippet for the conversations list. */
  preview: string | null;
};

function toConversationRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessageRecord(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    createdAt: row.createdAt,
  };
}

function logDbError(context: string, error: unknown) {
  const cause =
    typeof error === 'object' && error !== null && 'cause' in error
      ? (error as { cause: unknown }).cause
      : undefined;

  console.error(context, {
    message: error instanceof Error ? error.message : String(error),
    code:
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      typeof (cause as { code: unknown }).code === 'string'
        ? (cause as { code: string }).code
        : undefined,
    causeMessage:
      cause instanceof Error
        ? cause.message
        : typeof cause === 'object' &&
            cause !== null &&
            'message' in cause &&
            typeof (cause as { message: unknown }).message === 'string'
          ? (cause as { message: string }).message
          : undefined,
  });
}

export async function insertConversation(input: {
  title?: string | null;
}): Promise<ConversationRecord> {
  try {
    const [row] = await db
      .insert(conversations)
      .values({
        title: input.title ?? null,
      })
      .returning();

    return toConversationRecord(row!);
  } catch (error) {
    logDbError('Conversation insert failed:', error);
    throw error;
  }
}

export async function findConversationById(
  id: string,
): Promise<ConversationRecord | null> {
  try {
    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    return row ? toConversationRecord(row) : null;
  } catch (error) {
    logDbError('Conversation find failed:', error);
    throw error;
  }
}

export async function touchConversationUpdatedAt(
  id: string,
): Promise<ConversationRecord | null> {
  try {
    const [row] = await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();

    return row ? toConversationRecord(row) : null;
  } catch (error) {
    logDbError('Conversation touch updatedAt failed:', error);
    throw error;
  }
}

export async function setConversationTitleIfEmpty(
  id: string,
  title: string,
): Promise<void> {
  try {
    const existing = await findConversationById(id);
    if (!existing || existing.title) {
      return;
    }

    await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, id));
  } catch (error) {
    logDbError('Conversation set title failed:', error);
    throw error;
  }
}

export async function insertMessage(input: {
  conversationId: string;
  role: MessageRole;
  content: string;
}): Promise<MessageRecord> {
  try {
    const [row] = await db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
      })
      .returning();

    return toMessageRecord(row!);
  } catch (error) {
    logDbError('Message insert failed:', error);
    throw error;
  }
}

export async function listMessagesByConversationId(
  conversationId: string,
): Promise<MessageRecord[]> {
  try {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    return rows.map(toMessageRecord);
  } catch (error) {
    logDbError('Message list failed:', error);
    throw error;
  }
}

/**
 * Recent conversations for the Conversations screen.
 * Preview = latest message content (may be null for empty threads).
 */
export async function listRecentConversations(
  limit = 50,
): Promise<ConversationPreviewRecord[]> {
  try {
    const rows = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);

    const previews: ConversationPreviewRecord[] = [];

    for (const row of rows) {
      const [latest] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, row.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      previews.push({
        ...toConversationRecord(row),
        preview: latest?.content ?? null,
      });
    }

    return previews;
  } catch (error) {
    logDbError('Conversation list failed:', error);
    throw error;
  }
}
