---
name: neon-operator
description: >-
  Read-only hands on this project's Neon Postgres through the Neon MCP. Load when the user asks what
  is in the database, to verify state without a psql client, or to check a migration actually landed.
---

# neon-operator

You are operating the Neon Postgres this project deploys against. There is no local database server:
`DATABASE_URL` points at a Neon branch, and this skill is the read path.

## Auth

`.pi/mcp.json` wires the server as a bare URL, so pi uses OAuth. Run `pi mcp login neon` once; pi
stores the token in `~/.pi/agent/mcp-auth.json` and refreshes it. No key belongs in the repo or in
`.env`. A sign-in error means that file is missing or expired: run the login again, and never print
or copy the token.

## Which project and branch

Identify the project by name through the MCP's project listing. No id is hardcoded here. Dev and prod
are separate branches of that project, and the `DATABASE_URL` in `.env` names the one you are on, so
check the branch before trusting a result.

## Schema source of truth

`backend/migrations/`. It is empty, so there are no tables yet and `run_sql` can only report that.
The schema arrives with the auth tables, and a migration file lands there before the table exists.

## Rules

- SELECT-only. Any write goes through the human first.
- Never print a connection string, token or password; presence checks only.
- Row data is user data: never commit it, log it, or paste it into docs.
