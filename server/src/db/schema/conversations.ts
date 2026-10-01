import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { MESSAGE_ROLES } from '../../chat/message-roles.js';

/**
 * Chat persistence — conversation threads for recent chats / message history.
 * Separate from long-term memories (no embeddings, no memoryId).
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** Nullable until a later task sets title (first message / generation). */
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    /** Supports GET recent conversations ORDER BY updated_at DESC. */
    index('conversations_updated_at_idx').on(table.updatedAt),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;

/**
 * PostgreSQL enum for chat message roles (user | assistant only).
 */
export const messageRoleEnum = pgEnum(
  'message_role',
  MESSAGE_ROLES as unknown as [string, ...string[]],
);

/**
 * Messages belonging to a conversation.
 * ON DELETE CASCADE removes orphans when a conversation is deleted.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    /** Supports WHERE conversation_id = ? */
    index('messages_conversation_id_idx').on(table.conversationId),
    /** Supports ORDER BY created_at ASC within a conversation. */
    index('messages_created_at_idx').on(table.createdAt),
  ],
);

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
