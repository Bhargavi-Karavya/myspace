/**
 * Auth middleware + cross-user memory/conversation isolation tests.
 * Uses an injectable JWT verifier — no real Neon Auth network calls.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import express, { type Express } from 'express';
import { and, eq, isNull, like } from 'drizzle-orm';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import { conversations, messages } from '../db/schema/conversations.js';
import {
  requireAuth,
  setNeonJwtVerifierForTests,
} from '../middleware/auth.js';
import {
  deleteMemoryById,
  findMemoryById,
  insertMemory,
  listMemories,
  searchSimilarMemories,
  updateMemoryEmbedding,
} from '../repositories/memory.repository.js';
import {
  deleteConversationByIdAndUserId,
  findConversationByIdAndUserId,
  insertConversation,
  insertMessage,
  listMessagesByConversationId,
  listRecentConversationsByUserId,
} from '../repositories/conversation.repository.js';
import {
  createConversation,
  deleteConversation,
  getConversationWithMessages,
  getRecentConversations,
  persistChatTurn,
  ConversationNotFoundError,
} from '../services/conversation.service.js';
import { retrieveRelevantContext } from '../services/rag-retrieval.service.js';
import { buildUserRagContextForChat } from '../services/chat-rag.service.js';
import { aiRouter } from '../routes/ai.routes.js';

const USER_A = 'isolation-user-a';
const USER_B = 'isolation-user-b';
const MARKER = 'isolation-ownership-test';

function unitAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === index ? 1 : 0,
  );
}

async function withJson(
  app: Express,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`http://127.0.0.1:${(app as Express & { __port: number }).__port}${path}`, {
    method: method.toUpperCase(),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

describe('requireAuth (Neon Auth JWT)', () => {
  after(() => {
    setNeonJwtVerifierForTests(undefined);
  });

  it('returns 401 when Authorization header is missing', async () => {
    setNeonJwtVerifierForTests(async () => ({ id: USER_A }));
    const app = express();
    app.use(express.json());
    app.get('/protected', requireAuth, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const server = app.listen(0);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const port = address.port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/protected`);
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /Authentication required/i);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('sets authUser from verified token sub (never from body userId)', async () => {
    setNeonJwtVerifierForTests(async (token) => {
      if (token === 'token-a') return { id: USER_A };
      return null;
    });

    const app = express();
    app.use(express.json());
    app.post('/protected', requireAuth, (req, res) => {
      res.status(200).json({
        authUserId: req.authUser?.id,
        bodyUserId: (req.body as { userId?: string }).userId ?? null,
      });
    });

    const server = app.listen(0);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const port = address.port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/protected`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer token-a',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ userId: USER_B }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        authUserId: string;
        bodyUserId: string;
      };
      assert.equal(body.authUserId, USER_A);
      assert.equal(body.bodyUserId, USER_B);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

describe('memory + conversation isolation (requires PostgreSQL)', () => {
  const createdMemoryIds: string[] = [];
  const createdConversationIds: string[] = [];

  before(async () => {
    await db.select({ id: memories.id }).from(memories).limit(1);
    await db.select({ id: conversations.id }).from(conversations).limit(1);
  });

  after(async () => {
    for (const id of createdMemoryIds) {
      await db.delete(memories).where(eq(memories.id, id));
    }
    for (const id of createdConversationIds) {
      await db.delete(conversations).where(eq(conversations.id, id));
    }
    // Leave any pre-existing ownerless rows untouched.
    await db
      .delete(memories)
      .where(and(like(memories.content, `%${MARKER}%`), isNull(memories.userId)));
  });

  it('User A can create/list own memories; User B cannot see them', async () => {
    const saved = await insertMemory({
      userId: USER_A,
      content: `${MARKER} User A name is Bhargavi`,
      category: 'personal',
      importance: 0.9,
    });
    createdMemoryIds.push(saved.id);

    const aList = await listMemories(USER_A);
    assert.ok(aList.some((row) => row.id === saved.id));

    const bList = await listMemories(USER_B);
    assert.equal(
      bList.some((row) => row.id === saved.id),
      false,
    );

    const stolen = await findMemoryById(saved.id, USER_B);
    assert.equal(stolen, null);

    const deletedByB = await deleteMemoryById(saved.id, USER_B);
    assert.equal(deletedByB, false);

    const stillThere = await findMemoryById(saved.id, USER_A);
    assert.ok(stillThere);
  });

  it('semantic search only returns the authenticated user memories (SQL-scoped)', async () => {
    const aMemory = await insertMemory({
      userId: USER_A,
      content: `${MARKER} prefers React`,
      category: 'professional',
      importance: 0.8,
    });
    const bMemory = await insertMemory({
      userId: USER_B,
      content: `${MARKER} prefers Vue`,
      category: 'professional',
      importance: 0.8,
    });
    createdMemoryIds.push(aMemory.id, bMemory.id);

    const query = unitAt(7);
    await updateMemoryEmbedding(aMemory.id, query, USER_A);
    await updateMemoryEmbedding(bMemory.id, query, USER_B);

    const aHits = await searchSimilarMemories(query, 10, { userId: USER_A });
    assert.ok(aHits.some((hit) => hit.id === aMemory.id));
    assert.equal(
      aHits.some((hit) => hit.id === bMemory.id),
      false,
    );

    const bHits = await searchSimilarMemories(query, 10, { userId: USER_B });
    assert.ok(bHits.some((hit) => hit.id === bMemory.id));
    assert.equal(
      bHits.some((hit) => hit.id === aMemory.id),
      false,
    );
  });

  it('RAG retrieval only returns the current user memories', async () => {
    const aMemory = await insertMemory({
      userId: USER_A,
      content: `${MARKER} lives in Bangalore`,
      category: 'personal',
      importance: 0.85,
    });
    const bMemory = await insertMemory({
      userId: USER_B,
      content: `${MARKER} lives in Mumbai`,
      category: 'personal',
      importance: 0.85,
    });
    createdMemoryIds.push(aMemory.id, bMemory.id);

    const vector = unitAt(11);
    await updateMemoryEmbedding(aMemory.id, vector, USER_A);
    await updateMemoryEmbedding(bMemory.id, vector, USER_B);

    const result = await retrieveRelevantContext(
      { query: 'where do I live', userId: USER_A },
      {
        generateQueryEmbedding: async () => ({
          query: 'where do I live',
          vector,
          dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
        }),
      },
    );

    assert.ok(result.memories.some((m) => m.id === aMemory.id));
    assert.equal(
      result.memories.some((m) => m.id === bMemory.id),
      false,
    );

    const rag = await buildUserRagContextForChat(
      { query: 'where do I live', userId: USER_B },
      {
        generateQueryEmbedding: async () => ({
          query: 'where do I live',
          vector,
          dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
        }),
      },
    );
    assert.ok(
      rag.memories.every((m) => m.content.includes('Mumbai')),
    );
    assert.equal(
      rag.memories.some((m) => m.content.includes('Bangalore')),
      false,
    );
  });

  it('ownerless legacy memories are excluded from user-scoped queries', async () => {
    const [legacy] = await db
      .insert(memories)
      .values({
        userId: null,
        content: `${MARKER} orphan legacy memory`,
        category: 'other',
        importance: 0.5,
        embedding: unitAt(3),
      })
      .returning({ id: memories.id });
    assert.ok(legacy);
    createdMemoryIds.push(legacy.id);

    const listed = await listMemories(USER_A);
    assert.equal(
      listed.some((row) => row.id === legacy.id),
      false,
    );

    const hits = await searchSimilarMemories(unitAt(3), 10, {
      userId: USER_A,
    });
    assert.equal(
      hits.some((hit) => hit.id === legacy.id),
      false,
    );
  });

  it('User B cannot load or delete User A conversation', async () => {
    const conversation = await createConversation({
      userId: USER_A,
      title: `${MARKER} private chat`,
    });
    createdConversationIds.push(conversation.id);

    await insertMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'hello from A',
    });

    const stolen = await findConversationByIdAndUserId(
      conversation.id,
      USER_B,
    );
    assert.equal(stolen, null);

    await assert.rejects(
      () => getConversationWithMessages(conversation.id, USER_B),
      (error: unknown) => error instanceof ConversationNotFoundError,
    );

    const deleted = await deleteConversationByIdAndUserId(
      conversation.id,
      USER_B,
    );
    assert.equal(deleted, false);

    const still = await findConversationByIdAndUserId(
      conversation.id,
      USER_A,
    );
    assert.ok(still);

    const recentA = await getRecentConversations(USER_A, 50);
    assert.ok(recentA.some((row) => row.id === conversation.id));

    const recentB = await listRecentConversationsByUserId(USER_B, 50);
    assert.equal(
      recentB.some((row) => row.id === conversation.id),
      false,
    );

    // Messages only via owned conversation path
    const owned = await getConversationWithMessages(conversation.id, USER_A);
    assert.equal(owned.messages.length, 1);
    assert.equal(
      (await listMessagesByConversationId(conversation.id)).length,
      1,
    );

    await deleteConversation(conversation.id, USER_A);
  });

  it('persistChatTurn attaches conversation to authenticated user only', async () => {
    const { conversationId } = await persistChatTurn({
      userId: USER_A,
      userContent: `${MARKER} My name is Bhargavi`,
      assistantContent: 'Nice to meet you, Bhargavi.',
    });
    createdConversationIds.push(conversationId);

    const owned = await findConversationByIdAndUserId(conversationId, USER_A);
    assert.equal(owned?.userId, USER_A);

    const notOwned = await findConversationByIdAndUserId(
      conversationId,
      USER_B,
    );
    assert.equal(notOwned, null);
  });
});

describe('protected memory/conversation HTTP APIs', () => {
  let app: Express & { __port: number };
  let server: ReturnType<Express['listen']>;

  before(async () => {
    setNeonJwtVerifierForTests(async (token) => {
      if (token === 'token-a') return { id: USER_A };
      if (token === 'token-b') return { id: USER_B };
      return null;
    });

    app = express() as Express & { __port: number };
    app.use(express.json());
    app.use('/api/ai', aiRouter);

    server = app.listen(0);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    app.__port = address.port;
  });

  after(async () => {
    setNeonJwtVerifierForTests(undefined);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('unauthenticated memory list → 401', async () => {
    const result = await withJson(app, 'get', '/api/ai/memory');
    assert.equal(result.status, 401);
  });

  it('unauthenticated create conversation → 401', async () => {
    const result = await withJson(app, 'post', '/api/ai/conversations', {
      body: {},
    });
    assert.equal(result.status, 401);
  });

  it('authenticated create conversation uses verified user, not body userId', async () => {
    const created = await withJson(app, 'post', '/api/ai/conversations', {
      token: 'token-a',
      body: { userId: USER_B },
    });
    assert.equal(created.status, 201);
    const body = created.body as { id: string };
    assert.ok(body.id);

    const asB = await withJson(app, 'get', `/api/ai/conversations/${body.id}`, {
      token: 'token-b',
    });
    assert.equal(asB.status, 404);

    const asA = await withJson(app, 'get', `/api/ai/conversations/${body.id}`, {
      token: 'token-a',
    });
    assert.equal(asA.status, 200);

    await withJson(app, 'delete', `/api/ai/conversations/${body.id}`, {
      token: 'token-a',
    });
  });
});
