import cors from 'cors';
import express, { type RequestHandler, type Router } from 'express';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/health', healthRouter);

/** Load AI routes lazily so /api/health works even when env is missing. */
let aiRouterPromise: Promise<Router> | undefined;

const mountAiRouter: RequestHandler = (request, response, next) => {
  aiRouterPromise ??= import('./routes/ai.routes.js').then((module) => module.aiRouter);
  void aiRouterPromise
    .then((router) => {
      router(request, response, next);
    })
    .catch(next);
};

app.use('/api/ai', mountAiRouter);
app.use(errorHandler);

/** Default export for Vercel Express detection. */
export default app;
