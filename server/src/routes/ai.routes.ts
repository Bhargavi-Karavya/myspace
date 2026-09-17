import { Router } from 'express';
import {
  chatWithAi,
  getAiTest,
  jsonWithAi,
  structuredWithAi,
} from '../controllers/ai.controller.js';

export const aiRouter = Router();

aiRouter.get('/test', getAiTest);
aiRouter.post('/chat', chatWithAi);
aiRouter.post('/structured', structuredWithAi);
aiRouter.post('/json', jsonWithAi);
