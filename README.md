# dsa-finals-psu

## Setup on Windows

Double-click `scripts\setup.cmd`, or run it from a terminal:

```bat
scripts\setup.cmd
```

It installs Node LTS, Git, VS Code and GitHub Desktop through winget, refreshes PATH, and prints the versions with `SETUP OK`. Running it again is safe.

If winget is missing, install these by hand and reopen the terminal:

| Tool           | Source                        |
| -------------- | ----------------------------- |
| Node LTS       | https://nodejs.org            |
| Git            | https://git-scm.com           |
| VS Code        | https://code.visualstudio.com |
| GitHub Desktop | https://desktop.github.com    |

Frontend only, no database or backend:

```bat
cd frontend
npm ci
npm run dev
```

Then open http://localhost:5373.

## Host

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

## Docker and Makefile

```sh
cp .env.example .env
make build
make up
```

## Commands

| Command                          | Does                                                  |
| -------------------------------- | ----------------------------------------------------- |
| `make build`                     | build dev images                                      |
| `make up`                        | free ports, start the dev stack                       |
| `make down` / `make clean`       | stop, stop and delete the dev volume                  |
| `make logs` / `make ps`          | follow logs, list containers                          |
| `make exec`                      | Biome, tsc, audit and outdated in both dev containers |
| `make lint`                      | Biome fix in both dev containers                      |
| `make shell` / `make psql`       | shell in the backend, psql into `DATABASE_URL`        |
| `make migrate` / `make rollback` | node-pg-migrate up / down                             |
| `make new-migration name=x`      | create a migration file                               |
| `make prod-build`                | build prod images                                     |
| `make prod-up`                   | free ports, start the prod overlay                    |
| `make prod-down`                 | stop prod, delete its volume and local images         |
| `make prod-scan`                 | build prod, scan both images at HIGH and CRITICAL     |
| `make check-ports`               | free 5373/4100/5433 from other compose projects       |

## Decisions

| Decision                                        | Why                                                                                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Javascript/Typescript                           | Alot simpler to integrate and connect with languages intertwined, making the architecture and code alot easier to understand, develop, and learn.                                   |
| Hono over Express                               | Web-standard handlers and a typed context. Express as alternative as the reference for auth and middleware once routes exist.                                                       |
| Plain Vite 8 over Vite+                         | Vite+ bundles Vite, Vitest, Oxlint, Oxfmt and turbo behind a global installer and would replace Biome. Two services do not need that consolidation.                                 |
| No Tailwind                                     | No UI design yet. Plain CSS for lessen complexity with separation of concerns .                                                                                                     |
| No test runner                                  | Lowered-tier app: a test earns its place when the failure it catches costs more than the test. CI still gates lint, format, typecheck, build and the image scan, and reports audit. |
| node-pg-migrate                                 | TypeScript runner with up and down in one file, no extra service. The migrations directory is empty, so nothing applies yet.                                                        |
| Neon Postgres, `production` and `development` branches, local container behind a profile | No local Postgres to run or version. Dev and prod are Neon branches, so a clone only needs a connection string.                                                                     |
| Vercel deploys, no CD workflow                  | Vercel builds and deploys on push from its git integration, so GitHub only runs CI. Compose stays for local and host runs.                                                          |
