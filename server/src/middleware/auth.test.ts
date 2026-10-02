/**
 * Pure auth middleware tests (no database).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import express from 'express';
import {
  requireAuth,
  setNeonJwtVerifierForTests,
} from '../middleware/auth.js';

describe('requireAuth middleware (no DB)', () => {
  after(() => {
    setNeonJwtVerifierForTests(undefined);
  });

  it('rejects missing bearer token with 401', async () => {
    setNeonJwtVerifierForTests(async () => ({ id: 'user-1' }));
    const app = express();
    app.get('/x', requireAuth, (_req, res) => {
      res.json({ ok: true });
    });
    const server = app.listen(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const response = await fetch(`http://127.0.0.1:${address.port}/x`);
      assert.equal(response.status, 401);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('rejects invalid token with 401', async () => {
    setNeonJwtVerifierForTests(async () => null);
    const app = express();
    app.get('/x', requireAuth, (_req, res) => {
      res.json({ ok: true });
    });
    const server = app.listen(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const response = await fetch(`http://127.0.0.1:${address.port}/x`, {
        headers: { authorization: 'Bearer bad' },
      });
      assert.equal(response.status, 401);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('accepts verified token and ignores body userId for identity', async () => {
    setNeonJwtVerifierForTests(async (token) =>
      token === 'good' ? { id: 'verified-user' } : null,
    );
    const app = express();
    app.use(express.json());
    app.post('/x', requireAuth, (req, res) => {
      res.json({
        id: req.authUser?.id,
        bodyUserId: (req.body as { userId?: string }).userId ?? null,
      });
    });
    const server = app.listen(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const response = await fetch(`http://127.0.0.1:${address.port}/x`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer good',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ userId: 'attacker-user' }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        id: string;
        bodyUserId: string;
      };
      assert.equal(body.id, 'verified-user');
      assert.equal(body.bodyUserId, 'attacker-user');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
