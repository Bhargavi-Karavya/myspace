# MySpace

MySpace is a long-term learning project for building a personal application step by step. This repository currently contains **Phase 0: Foundation** only: a React client, an Express API, and local PostgreSQL connectivity through Drizzle ORM.

## Current stack

- Frontend: React, Vite, TypeScript (the existing client)
- Backend: Node.js, Express, TypeScript, Zod
- Database: PostgreSQL and Drizzle ORM
- Local database: Docker Compose

## Project structure

```text
myspace/
├── client/                 # Vite + React application
├── server/                 # Express + TypeScript API
│   └── src/
│       ├── config/         # Validated environment configuration
│       ├── controllers/    # Request handlers
│       ├── db/             # Drizzle/PostgreSQL connection
│       ├── middleware/     # Express middleware
│       └── routes/         # HTTP routes
├── docker-compose.yml      # PostgreSQL only
└── README.md
```

## Start PostgreSQL

From the project root:

```bash
docker compose up -d
docker compose ps
```

The default local connection settings are database `myspace`, user `myspace`, password `myspace_password`, and host port `5434` (the container itself uses PostgreSQL's standard port `5432`). Port `5434` avoids existing local conflicts. You can override these settings for Compose with `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_PORT`; if you do, update `server/.env` so `DATABASE_URL` matches.

To stop PostgreSQL while preserving its volume:

```bash
docker compose down
```

## Start the backend

`server/.env` is already configured for the default Docker database. For a fresh clone, copy the example and fill in its values:

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

The API listens on `http://localhost:5000` by default. Build and run its compiled output with:

```bash
npm run build
npm start
```

## Start the frontend

In a separate terminal:

```bash
cd client
npm install
npm run dev
```

## Verify the API and database

With PostgreSQL and the backend running:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/db
```

The first confirms Express is running. The second runs `SELECT 1` through Drizzle against PostgreSQL, confirming the API-to-database connection.

## Future work

Future phases may add application features and AI capabilities. They are intentionally not part of this Phase 0 foundation.
