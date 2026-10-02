# Neon Auth setup

## Local
1. Neon Console → your project → **Auth** → Enable Auth (if needed).
2. Copy **Auth Base URL** from Configuration.
3. Create `client/.env`:

```bash
VITE_NEON_AUTH_URL=https://ep-xxx.neonauth….neon.build/neondb/auth
```

4. Create / update `server/.env` with the **same** Auth URL (JWKS verification for API requests):

```bash
NEON_AUTH_URL=https://ep-xxx.neonauth….neon.build/neondb/auth
```

5. `cd client && npm run dev` → Profile → Sign up / Sign in / Continue with Google.

Google works in development with Neon’s shared credentials (consent screen shows Neon branding).

The client sends `Authorization: Bearer <JWT>` from Neon Auth.

Use `authClient.token()` (hits `GET {VITE_NEON_AUTH_URL}/token`). The auth client must use `credentials: 'include'` so the session cookie is sent cross-origin from `localhost` to Neon Auth.

Do **not** call `/get-jwt-token` — that path does not exist on Managed Better Auth (404).

The Express API verifies that JWT against Neon’s JWKS (`{NEON_AUTH_URL}/.well-known/jwks.json`) — it never trusts a client-supplied `userId`.

If `token()` returns undefined while signed in, check:
1. You are signed in (session cookie present).
2. Neon Auth → trusted domains includes `http://localhost:5173`.
3. Browser is not blocking third-party cookies for the Neon Auth host.

## Production (Vercel)
`VITE_NEON_AUTH_URL` is already set on the `myspace` Vercel project (Production + Preview). Also set `NEON_AUTH_URL` to the same value on the **server** / API environment. Redeploy after Auth URL changes so Vite can bake the client value into the build.

### Google for production
1. Google Cloud Console → OAuth client (Web application).
2. Authorized redirect URI: `{VITE_NEON_AUTH_URL}/callback/google`
3. Neon Console → Auth → OAuth providers → add your Google Client ID/Secret.
4. Neon Auth → trusted domains: `https://myspace-seven-delta.vercel.app` and `http://localhost:5173`.
