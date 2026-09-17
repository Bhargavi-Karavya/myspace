import { Router } from 'express';
import {
  chatWithAi,
  getAiTest,
  structuredWithAi,
} from '../controllers/ai.controller.js';

export const aiRouter = Router();

aiRouter.get('/test', getAiTest);
aiRouter.post('/chat', chatWithAi);
aiRouter.post('/structured', structuredWithAi);
