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
  /**
   * Neon Auth base URL (same value as client VITE_NEON_AUTH_URL).
   * Used to verify Bearer JWTs via JWKS — not a separate auth provider.
   */
  NEON_AUTH_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
      message: 'NEON_AUTH_URL must be an http(s) URL',
    }),
});

export type Env = z.infer<typeof envSchema>;

export type EnvStatus =
  | { ok: true; env: Env; missing: string[] }
  | {
      ok: false;
      env: null;
      missing: string[];
      fieldErrors: Record<string, string[] | undefined>;
    };

export function getEnvStatus(): EnvStatus {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) {
    return { ok: true, env: parsed.data, missing: [] };
  }

  const fieldErrors = parsed.error.flatten().fieldErrors;
  return {
    ok: false,
    env: null,
    missing: Object.keys(fieldErrors),
    fieldErrors,
  };
}

let cached: Env | undefined;

/** Throws only when a route actually needs config (not at module import). */
export function getEnv(): Env {
  if (cached) return cached;

  const status = getEnvStatus();
  if (!status.ok || !status.env) {
    console.error('[env] Invalid or missing environment variables:', status.fieldErrors);
    throw new Error(`Invalid environment: ${status.missing.join(', ') || 'unknown'}`);
  }

  cached = status.env;
  return cached;
}

/** Lazy access for existing `env.FOO` call sites. */
export const env: Env = new Proxy({} as Env, {
  get(_target, property) {
    return getEnv()[property as keyof Env];
  },
});
