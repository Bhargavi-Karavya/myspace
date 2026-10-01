import { Router } from 'express';
import {
  chatWithAi,
  classifyWithAi,
  createEmbeddingExperimentHandler,
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
  searchEmbeddingExperimentsHandler,
  searchMemoriesHandler,
  structuredWithAi,
} from '../controllers/ai.controller.js';

export const aiRouter = Router();

aiRouter.get('/test', getAiTest);
aiRouter.post('/chat', chatWithAi);
aiRouter.get('/conversations', listConversationsHandler);
aiRouter.get('/conversations/:id', getConversationHandler);
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
aiRouter.post('/memory/extract', memoryExtractWithAi);
aiRouter.get('/memory', listMemoriesHandler);
aiRouter.post('/memory/search', searchMemoriesHandler);
aiRouter.post('/rag/retrieve', ragRetrieveHandler);
aiRouter.post('/memory/:id/embedding/test', memoryEmbeddingTestHandler);
aiRouter.post('/memory/:id/embedding', persistMemoryEmbeddingHandler);
aiRouter.get('/memory/:id', getMemoryHandler);
aiRouter.patch('/memory/:id', patchMemoryHandler);
aiRouter.delete('/memory/:id', deleteMemory);
