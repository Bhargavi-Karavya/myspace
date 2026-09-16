import cors from 'cors';
import express from 'express';
import { errorHandler } from './middleware/error-handler.js';
import { aiRouter } from './routes/ai.routes.js';
import { healthRouter } from './routes/health.routes.js';

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/health', healthRouter);
app.use('/api/ai', aiRouter);
app.use(errorHandler);
