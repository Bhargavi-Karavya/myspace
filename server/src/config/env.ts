import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  // Neon/Postgres URLs are valid; avoid strict WHATWG-only checks that can reject them.
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith('postgres://') || value.startsWith('postgresql://'),
      { message: 'DATABASE_URL must be a postgres:// or postgresql:// URL' },
    ),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  /** Phase 4.1 — isolated embedding experiment model (not used for chat/memory). */
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.flatten().fieldErrors;
  console.error('[env] Invalid or missing environment variables:', details);
  throw new Error(
    `Invalid environment: ${Object.keys(details).join(', ') || 'unknown'}`,
  );
}

export const env = parsed.data;
