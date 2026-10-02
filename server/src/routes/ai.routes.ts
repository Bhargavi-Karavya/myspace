import { Router } from 'express';
import {
  chatWithAi,
  classifyWithAi,
  createConversationHandler,
  createEmbeddingExperimentHandler,
  deleteConversationHandler,
  deleteMemory,
  embeddingInspectWithAi,
  embeddingSearchWithAi,
  embeddingSimilarityWithAi,
  embeddingTestWithAi,
  extractWithAi,
  getAiTest,
  getConversationHandler,
  getMemoryHandler,
  intentWithAi,
  jsonWithAi,
  listConversationsHandler,
  listEmbeddingExperimentsHandler,
  listMemoriesHandler,
  memoryEmbeddingTestHandler,
  memoryExtractWithAi,
  patchMemoryHandler,
  persistMemoryEmbeddingHandler,
  ragRetrieveHandler,
  renameConversationHandler,
  searchEmbeddingExperimentsHandler,
  searchMemoriesHandler,
  structuredWithAi,
} from '../controllers/ai.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const aiRouter = Router();

/** Unauthenticated smoke / experiment endpoints (no personal data). */
aiRouter.get('/test', getAiTest);
aiRouter.post('/structured', structuredWithAi);
aiRouter.post('/json', jsonWithAi);
aiRouter.post('/extract', extractWithAi);
aiRouter.post('/classify', classifyWithAi);
aiRouter.post('/intent', intentWithAi);
aiRouter.post('/embedding/test', embeddingTestWithAi);
aiRouter.post('/embedding/similarity', embeddingSimilarityWithAi);
aiRouter.post('/embedding/inspect', embeddingInspectWithAi);
aiRouter.post('/embedding/search', embeddingSearchWithAi);
aiRouter.post('/embedding/experiment/search', searchEmbeddingExperimentsHandler);
aiRouter.post('/embedding/experiment', createEmbeddingExperimentHandler);
aiRouter.get('/embedding/experiment', listEmbeddingExperimentsHandler);

/** User-owned chat, conversations, and memories — require Neon Auth JWT. */
aiRouter.post('/chat', requireAuth, chatWithAi);
aiRouter.get('/conversations', requireAuth, listConversationsHandler);
aiRouter.post('/conversations', requireAuth, createConversationHandler);
aiRouter.get('/conversations/:id', requireAuth, getConversationHandler);
aiRouter.patch('/conversations/:id', requireAuth, renameConversationHandler);
aiRouter.delete('/conversations/:id', requireAuth, deleteConversationHandler);
aiRouter.post('/memory/extract', requireAuth, memoryExtractWithAi);
aiRouter.get('/memory', requireAuth, listMemoriesHandler);
aiRouter.post('/memory/search', requireAuth, searchMemoriesHandler);
aiRouter.post('/rag/retrieve', requireAuth, ragRetrieveHandler);
aiRouter.post('/memory/:id/embedding/test', requireAuth, memoryEmbeddingTestHandler);
aiRouter.post('/memory/:id/embedding', requireAuth, persistMemoryEmbeddingHandler);
aiRouter.get('/memory/:id', requireAuth, getMemoryHandler);
aiRouter.patch('/memory/:id', requireAuth, patchMemoryHandler);
aiRouter.delete('/memory/:id', requireAuth, deleteMemory);
