import { Router } from 'express';
import {
  getDatabaseHealth,
  getHealth,
  runSchemaMigrate,
} from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', getHealth);
healthRouter.get('/db', getDatabaseHealth);
healthRouter.post('/migrate', runSchemaMigrate);
