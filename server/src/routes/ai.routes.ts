import { Router } from 'express';
import {
  chatWithAi,
  classifyWithAi,
  deleteMemory,
  extractWithAi,
  getAiTest,
  intentWithAi,
  jsonWithAi,
  memoryExtractWithAi,
  structuredWithAi,
} from '../controllers/ai.controller.js';

export const aiRouter = Router();

aiRouter.get('/test', getAiTest);
aiRouter.post('/chat', chatWithAi);
aiRouter.post('/structured', structuredWithAi);
aiRouter.post('/json', jsonWithAi);
aiRouter.post('/extract', extractWithAi);
aiRouter.post('/classify', classifyWithAi);
aiRouter.post('/intent', intentWithAi);
aiRouter.post('/memory/extract', memoryExtractWithAi);
aiRouter.delete('/memory/:id', deleteMemory);
