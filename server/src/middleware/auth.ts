import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env.js';

export type AuthenticatedUser = {
  /** Neon Auth / Better Auth user id (`sub` claim). Opaque string — not assumed UUID. */
  id: string;
};

export type NeonJwtVerifier = (
  token: string,
) => Promise<AuthenticatedUser | null>;

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedJwksUrl: string | undefined;

/** Injectable for tests — production uses Neon Auth JWKS verification. */
let jwtVerifierOverride: NeonJwtVerifier | undefined;

const VERIFY_TIMEOUT_MS = 8_000;

export function setNeonJwtVerifierForTests(
  verifier: NeonJwtVerifier | undefined,
): void {
  jwtVerifierOverride = verifier;
}

function getJwks() {
  // Neon docs: <NEON_AUTH_URL>/.well-known/jwks.json (includes /neondb/auth).
  const jwksUrl = `${env.NEON_AUTH_URL.replace(/\/$/, '')}/.well-known/jwks.json`;
  if (!cachedJwks || cachedJwksUrl !== jwksUrl) {
    cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
    cachedJwksUrl = jwksUrl;
  }
  return cachedJwks;
}

function neonAuthIssuers(): string[] {
  const base = env.NEON_AUTH_URL.replace(/\/$/, '');
  const origin = new URL(base).origin;
  // Accept either origin or full auth base — Neon payloads commonly use origin.
  return Array.from(new Set([origin, base]));
}

function userFromPayload(payload: JWTPayload): AuthenticatedUser | null {
  const sub = payload.sub;
  if (typeof sub !== 'string' || !sub.trim()) {
    return null;
  }
  return { id: sub };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Verify a Neon Auth JWT (JWT plugin) against the project's JWKS endpoint.
 * Does not trust client-supplied user IDs.
 * Rejects opaque session tokens immediately (they are not JWTs).
 */
export async function verifyNeonAuthJwt(
  token: string,
): Promise<AuthenticatedUser | null> {
  if (jwtVerifierOverride) {
    return jwtVerifierOverride(token);
  }

  // Opaque Better Auth session tokens look like "L0tKdf4n..." — not JWTs.
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }

  const issuers = neonAuthIssuers();
  let lastError: unknown;

  for (const issuer of issuers) {
    try {
      const { payload } = await withTimeout(
        jwtVerify(token, getJwks(), { issuer }),
        VERIFY_TIMEOUT_MS,
        'Neon Auth JWT verification',
      );
      return userFromPayload(payload);
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  console.warn('[auth] JWT verification failed:', message);
  return null;
}

function extractBearerToken(request: Request): string | null {
  const header = request.header('authorization');
  if (!header) return null;

  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * Require a verified Neon Auth JWT. Sets `request.authUser` from the token `sub`.
 */
export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(request);
  if (!token) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }

  const startedAt = Date.now();
  try {
    const user = await verifyNeonAuthJwt(token);
    console.info('[auth] requireAuth', {
      path: request.path,
      ok: Boolean(user),
      ms: Date.now() - startedAt,
    });

    if (!user) {
      response.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    request.authUser = user;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[auth] requireAuth error:', message);
    if (/timed out/i.test(message)) {
      response.status(503).json({
        error: 'Auth verification timed out. Check NEON_AUTH_URL / JWKS reachability.',
      });
      return;
    }
    next(error);
  }
}

/** Convenience accessor after requireAuth. */
export function getAuthenticatedUserId(request: Request): string {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new Error('Authenticated user is missing from request');
  }
  return userId;
}
