# dsa-finals-psu

Platform scaffold for the DSA finals project: React frontend, Hono API, Neon Postgres, Docker Compose, GitHub CI. No domain code, no tables, no auth, no observability yet.

## Run

```sh
cp .env.example .env
make build
make up
```

Set `DATABASE_URL` in `.env` to the Neon dev branch. Frontend at http://localhost:5373, API at http://localhost:4100/healthz.

Compose reads `.env`. Services must be running for `make exec`, `make lint`, `make shell`, `make psql` and `make migrate`. Both overlays publish 5373 and 4100; starting one frees those ports from the other compose project, stopping it without deleting its volume.

`make down` stops the dev stack, `make clean` stops it and deletes the dev volume.

## Host

Node 24. Nothing to start for the database; both services run on the host against `DATABASE_URL`.

Backend, in `backend/`:

```sh
npm ci
DATABASE_URL=<neon dev branch url> npm run dev
```

Frontend, in `frontend/`:

```sh
npm ci
npm run dev
```

The backend listens on 4100. The frontend proxies `/api` to `http://localhost:4100` by default; set `DEVELOPMENT_BACKEND_URL` to point elsewhere. Run migrations from `backend/` with the same `DATABASE_URL`, for example `DATABASE_URL=... npm run migrate:up`.

To run the database locally instead, start it under the `local-db` profile. It publishes 5433, so a host-run backend uses `postgres://dsa:dsa@localhost:5433/dsa` and a containerized one uses `postgres://dsa:dsa@postgres:5432/dsa`:

```sh
docker compose -p dsa-finals-psu-dev -f compose.yml -f compose.dev.yml --profile local-db up -d --wait postgres
```

## Commands

| Command | Does |
|---|---|
| `make build` | build dev images |
| `make up` | free ports, start the dev stack |
| `make down` / `make clean` | stop, stop and delete the dev volume |
| `make logs` / `make ps` | follow logs, list containers |
| `make exec` | Biome, tsc, audit and outdated in both dev containers |
| `make lint` | Biome fix in both dev containers |
| `make shell` / `make psql` | shell in the backend, psql into `DATABASE_URL` |
| `make migrate` / `make rollback` | node-pg-migrate up / down |
| `make new-migration name=x` | create a migration file |
| `make prod-build` | build prod images |
| `make prod-up` | free ports, start the prod overlay |
| `make prod-down` | stop prod, delete its volume and local images |
| `make prod-scan` | build prod, scan both images at HIGH and CRITICAL |
| `make check-ports` | free 5373/4100/5433 from other compose projects |

## Layout

```
backend/     Hono + pg pool, node-pg-migrate, Biome, multi-stage Dockerfile
frontend/    Vite + React + react-router, Biome, nginx prod image
compose.yml  base services; compose.dev.yml and compose.prod.yml overlays
scripts/     port-claimer.sh
```

## Decisions

| Decision | Why |
|---|---|
| Hono over Express | Web-standard handlers and a typed context. Express stays in diagram_website as the reference for auth and middleware once routes exist. |
| Plain Vite 8 over Vite+ | Vite+ bundles Vite, Vitest, Oxlint, Oxfmt and turbo behind a global installer and would replace Biome. Two services do not need that consolidation. |
| No Tailwind | No UI design yet. Plain CSS until there are components worth styling. |
| Biome only, no test runner | Lowered-tier app: a test earns its place when the failure it catches costs more than the test. CI still gates lint, format, typecheck, build and the image scan, and reports audit. |
| node-pg-migrate | TypeScript runner with up and down in one file, no extra service. The migrations directory is empty, so nothing applies yet. |
| Neon Postgres, local container behind a profile | No local Postgres to run or version. Dev and prod are Neon branches, so a clone only needs a connection string. |
| No tables | The schema follows the app's data model, which is not defined. The auth tables are planned in Next. |
| No observability | No traffic or SLO to measure. The LGTM stack in diagram_website/lgtm attaches when there is. |
| Compose and CI now, CD stub | No cluster or registry target exists. `cd-pipeline.yml` is `workflow_dispatch` only. |
| Ports 5373, 4100, 5433 | diagram_website already holds 5273, 3100, 5432. port-claimer frees these from other compose projects. |
| Postgres volume at `/var/lib/postgresql` | PG18 stores data in a versioned subdirectory; mounting a narrower path loses data on upgrade. |

## Next

- Auth: users and sessions tables. Login issues a random 32-byte token in an httpOnly cookie; the DB stores only its SHA-256 hash with an expiry. Documented only, no code.
- Observability: copy `diagram_website/lgtm` plus the OTel instrumentation, add postgres-exporter, attach once there is traffic worth measuring.
- CD: copy the diagram_website pipeline, GHCR images and a kustomize bump into the gitops repo. Needs a cluster and a hostname first.
