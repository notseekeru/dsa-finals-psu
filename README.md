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
npm run dev
```

`backend/.env` holds `DATABASE_URL` and `.envrc` exports it into the shell. Without direnv, pass it inline: `DATABASE_URL=... npm run dev`.

Frontend, in `frontend/`:

```sh
npm ci
npm run dev
```

`flake.nix` supplies Node 24 and `playwright-mcp` to `nix develop` and direnv, and `.envrc` exports `.env` and `backend/.env` into that shell.

## Docker and Makefile

```sh
cp .env.example .env
cp backend/.env.example backend/.env
make build
make up
```

`make up` refuses to start until `DATABASE_URL` in `backend/.env` points at the dev branch.

## Deploy

Two Vercel projects build from this repo: `dsa-2c` from `frontend/` and `dsa-2c-api` from `backend/`. The site is https://dsa-2c.vercel.app, and `/api/*` reaches the API through the rewrite in `frontend/vercel.json`, so the browser only uses one origin. The API project holds `DATABASE_URL` for the production branch.

Renaming a project does not move its `*.vercel.app` domain. Add the new domain to the project and update the rewrite in the same change.

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
| `make check-ports`               | free 5373/4100/5433 from other compose projects       |

## Architecture

```mermaid
---
config:
  layout: elk
---
flowchart TB
 subgraph Edge["Public Internet & Edge"]
        Browser["Browser"]
        FeDomain["dsa-2c.vercel.app"]
        ApiDomain["dsa-2c-api.vercel.app"]
  end

 subgraph Vercel["Vercel Platform"]
        subgraph Web["Project dsa-2c (root frontend/)"]
            subgraph WebBuild["Build: Vite 8 + React 19"]
                Spa["SPA (react-router 7 + ErrorBoundary)"]
                Headers["Headers (nosniff, referrer, frame, permissions)"]
            end
            subgraph WebRoute["Routing"]
                Rewrite["Rewrite /api/:path* (strip prefix)"]
                Fallback["SPA fallback to /index.html"]
            end
        end

        subgraph Api["Project dsa-2c-api (root backend/)"]
            subgraph ApiRuntime["Function: Node 24"]
                Hono["Hono 4 (GET /healthz)"]
                Pool["pg pool (DATABASE_URL)"]
            end
        end
  end

 subgraph Local["Local Development (docker compose, project dsa-finals-psu-dev)"]
        subgraph ComposeWeb["dsa-finals-psu_frontend_dev :5373"]
            DevVite["Vite dev server (HMR, polling)"]
            DevProxy["Proxy /api (strip prefix, DEVELOPMENT_BACKEND_URL=http://backend:4100)"]
        end

        subgraph ComposeApi["dsa-finals-psu_backend_dev :4100"]
            DevServe["tsx watch src/serve.ts (SIGTERM drains pool)"]
            DevHono["Hono 4 (GET /healthz)"]
            DevPool["pg pool (backend/.env)"]
        end

        subgraph ComposeTools["Profiles"]
            Psql["dsa-finals-psu_psql_dev (profile tools, psql DATABASE_URL)"]
            Pg["dsa-finals-psu_postgres (profile local-db, postgres:18-alpine :5433)"]
        end

        subgraph ComposeNet["Networks"]
            NetApp["app (egress)"]
            NetDb["db (internal)"]
        end

        subgraph ComposeVol["Volumes"]
            VolPg["postgres_data"]
            VolNm["anonymous node_modules"]
        end
  end

 subgraph Data["Data (Neon)"]
        NeonProd[("Neon Postgres (production branch)")]
        NeonDev[("Neon Postgres (development branch)")]
        Migrate["node-pg-migrate (backend/migrations)"]
  end

 subgraph Workflow["Makefile Workflow"]
        MPorts["check-ports (port-claimer.sh, 5373 4100 5433)"]
        MUp["make up"]
        MBuild["make build / buildcache"]
        MDown["make down / clean"]
        MLogs["make logs / ps"]
        MLint["make lint (biome --fix --unsafe)"]
        MExec["make exec (lint, typecheck, audit, outdated, prune)"]
        MShell["make shell"]
        MPsql["make psql"]
        MMigrate["make migrate / rollback / new-migration"]
        MPorts --> MUp
        MLint --> MExec
  end

 subgraph GitHub["GitHub Platform"]
        subgraph CI["CI workflow (push and PR to main, paths frontend/** backend/**)"]
            CiInstall["npm ci (Node 24, matrix frontend + backend)"]
            CiLint["Biome --fix --unsafe"]
            CiFormat["git diff --exit-code"]
            CiTypes["tsc --noEmit"]
            CiBuild["build"]
            CiAudit["npm audit (informational)"]
            CiInstall --> CiLint --> CiFormat --> CiTypes --> CiBuild --> CiAudit
        end

        subgraph Protection["Branch protection (main)"]
            PrRule["pull request, 1 approval, admins enforced"]
        end

        subgraph Deploy["Vercel Git Integration"]
            Trigger["push to main"]
            VBuild["build per project (frontend/ and backend/)"]
            VRelease["deploy dsa-2c and dsa-2c-api"]
            Trigger --> VBuild --> VRelease
        end

        PrRule --> CI
  end

    Browser --> FeDomain
    Browser -- "http://localhost:5373" --> DevVite
    FeDomain --> Rewrite
    FeDomain --> Fallback
    Fallback --> Spa
    Headers -.-> Spa
    Rewrite -- "/api/healthz to /healthz" --> Hono
    Hono --> Pool
    Pool -- "DATABASE_URL" --> NeonProd

    DevVite --> DevProxy
    DevProxy -- "/api/healthz to /healthz" --> DevServe
    DevServe --> DevHono
    DevServe --> DevPool
    DevPool -- "DATABASE_URL" --> NeonDev
    DevPool -. "offline" .-> Pg
    Psql -.-> NeonDev
    Pg -.-> VolPg
    ComposeApi -.-> NetDb
    ComposeWeb -.-> NetApp

    MUp --> Local
    MBuild --> Local
    MDown --> Local
    MLogs --> Local
    MExec --> Local
    MShell --> Local
    MPsql --> Psql
    MMigrate --> Migrate
    Migrate -- "make migrate" --> NeonDev
    Migrate -- "make migrate" --> NeonProd

    Trigger --> VBuild
    VRelease --> FeDomain
    VRelease --> ApiDomain
    ApiDomain --> Hono
```

## Decisions

| Decision                                        | Why                                                                                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Javascript/Typescript                           | Alot simpler to integrate and connect with languages intertwined, making the architecture and code alot easier to understand, develop, and learn.                                   |
| Hono over Express                               | Web-standard handlers and a typed context. Express as alternative as the reference for auth and middleware once routes exist.                                                       |
| Plain Vite 8 over Vite+                         | Vite+ bundles Vite, Vitest, Oxlint, Oxfmt and turbo behind a global installer and would replace Biome. Two services do not need that consolidation.                                 |
| No Tailwind                                     | No UI design yet. Plain CSS for lessen complexity with separation of concerns .                                                                                                     |
| No test runner                                  | Lowered-tier app: a test earns its place when the failure it catches costs more than the test. CI still gates lint, format, typecheck and build, and reports audit.                   |
| node-pg-migrate                                 | TypeScript runner with up and down in one file, no extra service. The migrations directory is empty, so nothing applies yet.                                                        |
| Neon Postgres, `production` and `development` branches, local container behind a profile | No local Postgres to run or version. Dev and prod are Neon branches, so a clone only needs a connection string.                                                                     |
| Vercel deploys, no CD workflow                  | Vercel builds and deploys on push from its git integration, so GitHub only runs CI. Compose stays for local and host runs.                                                          |
| Two Vercel projects, `/api` proxied             | Each service installs only its own dependencies, so no package is declared twice. One origin for the browser, no CORS to configure.                                                 |
| No prod Docker images                           | Vercel builds from source, so the images and their Trivy scan guarded nothing. Compose runs the dev targets only.                                                                   |
| Hono entry at `backend/src/index.ts`            | Vercel's Hono preset only looks for `app`, `index` or `server` at the project root or under `src`.                                                                                 |
| No `types` in the backend tsconfig              | Vercel compiles the function where `@types/node` is not installed, so pinning it fails the build with TS2688.                                                                      |
| Security headers in `frontend/vercel.json`      | Vercel sent only HSTS. The nginx headers never reached the live site, so the app's headers are config.                                                                              |
