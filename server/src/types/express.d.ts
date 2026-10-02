import type { AuthenticatedUser } from '../middleware/auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth after Neon Auth JWT verification. */
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
