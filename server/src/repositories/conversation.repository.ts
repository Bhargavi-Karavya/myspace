import { and, asc, desc, eq } from 'drizzle-orm';
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
  userId: string | null;
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

function ownedByUser(userId: string) {
  return eq(conversations.userId, userId);
}

function toConversationRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    userId: row.userId,
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
  userId: string;
  title?: string | null;
}): Promise<ConversationRecord> {
  try {
    const [row] = await db
      .insert(conversations)
      .values({
        userId: input.userId,
        title: input.title ?? null,
      })
      .returning();

    return toConversationRecord(row!);
  } catch (error) {
    logDbError('Conversation insert failed:', error);
    throw error;
  }
}

/**
 * Load a conversation only when it belongs to the authenticated user.
 * Legacy ownerless rows (user_id IS NULL) are never returned.
 */
export async function findConversationByIdAndUserId(
  id: string,
  userId: string,
): Promise<ConversationRecord | null> {
  try {
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), ownedByUser(userId)))
      .limit(1);

    return row ? toConversationRecord(row) : null;
  } catch (error) {
    logDbError('Conversation find failed:', error);
    throw error;
  }
}

export async function touchConversationUpdatedAt(
  id: string,
  userId: string,
): Promise<ConversationRecord | null> {
  try {
    const [row] = await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(and(eq(conversations.id, id), ownedByUser(userId)))
      .returning();

    return row ? toConversationRecord(row) : null;
  } catch (error) {
    logDbError('Conversation touch updatedAt failed:', error);
    throw error;
  }
}

export async function setConversationTitleIfEmpty(
  id: string,
  userId: string,
  title: string,
): Promise<void> {
  try {
    const existing = await findConversationByIdAndUserId(id, userId);
    if (!existing || existing.title) {
      return;
    }

    await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), ownedByUser(userId)));
  } catch (error) {
    logDbError('Conversation set title failed:', error);
    throw error;
  }
}

export async function updateConversationTitle(
  id: string,
  userId: string,
  title: string,
): Promise<ConversationRecord | null> {
  try {
    const [row] = await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), ownedByUser(userId)))
      .returning();

    return row ? toConversationRecord(row) : null;
  } catch (error) {
    logDbError('Conversation update title failed:', error);
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
 * Recent conversations for the authenticated user only.
 * Legacy ownerless rows are excluded via user_id filter.
 */
export async function listRecentConversationsByUserId(
  userId: string,
  limit = 50,
): Promise<ConversationPreviewRecord[]> {
  try {
    const rows = await db
      .select()
      .from(conversations)
      .where(ownedByUser(userId))
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

export async function deleteConversationByIdAndUserId(
  id: string,
  userId: string,
): Promise<boolean> {
  try {
    const deleted = await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), ownedByUser(userId)))
      .returning({ id: conversations.id });

    return deleted.length > 0;
  } catch (error) {
    logDbError('Conversation delete failed:', error);
    throw error;
  }
}
