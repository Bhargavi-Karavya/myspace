import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(error);

  const message = error instanceof Error ? error.message : 'Internal server error';
  if (message.startsWith('Invalid environment:')) {
    response.status(503).json({
      error: 'Server misconfigured',
      detail: message,
      hint: 'Set DATABASE_URL, GEMINI_API_KEY, and NEON_AUTH_URL in environment variables, then restart/redeploy.',
    });
    return;
  }

  response.status(500).json({ error: 'Internal server error' });
};
