---
name: hermetic-e2e
description: >-
  Drive a real headless browser against the running frontend through the `playwright` MCP server,
  called from a codemode script. Load when a UI change must be seen in a real browser or a rendering
  bug needs repro-ing with no human at the keyboard.
---

# Hermetic E2E

One path: the `playwright` MCP server, called from codemode. No node runner, no host script, no CJS.
Target is the real frontend at `localhost:5373` and the real backend at `localhost:4100`.

## Call shape

`.pi/mcp.json` leaves `exposure` unset, so playwright takes pi's default, `codemode`: its tools are
neither declared to the model nor listed in the codemode description. Reach them as
`tools.mcp__playwright__browser_*(...)` inside a codemode script.

```js
await tools.mcp__playwright__browser_navigate({ url: "http://localhost:5373/" });
const res = await tools.mcp__playwright__browser_evaluate({
  function: "() => document.querySelector('main h1').textContent", // a STRING, page scope
  filename: "probe.json", // optional: saves the result to a cwd-relative file
});
```

- `function` is a string expression evaluated in the page. It cannot import and cannot close over
  codemode state; build multi-line JS by concatenation.
- A call returns `### Result\n"..."\n### Ran Playwright code ...`. Slice between `### Result` and
  `### Ran` before parsing, or `JSON.parse` chokes on the escaped echo.
- `filename` writes relative to pi's cwd (the repo root), not `.playwright-mcp/`. Delete the file
  before committing.
- Loop and branch inside one codemode script rather than making N calls.

## Browsing rules

- **Don't snapshot-spam.** `browser_snapshot` dumps a full YAML accessibility tree into context.
  Snapshot once for refs, act, then gate the next read on `browser_wait_for` (`{text}`, `{textGone}`,
  `{time}`) instead of a fixed delay.
- `target` takes a snapshot ref (`e8`) or a unique CSS selector.
- Tool names carry the server prefix: a bare `browser_navigate` is "Tool not found".
- `browser_run_code_unsafe` runs arbitrary JS in the server process (RCE-equivalent). Reach for it
  only when the typed verbs cannot do the job.
- A locator timeout on the landing page usually means the SPA never mounted, not a stale selector:
  count the `#root` children with `browser_evaluate` before blaming the selector.

## Routes

`src/shared/router.js`: `/` landing, `/signin`, `/signup`, `/records`, catch-all `*`.

1. `/`: `main h1` renders, and the navbar carries a link to `/signin`.
2. `/signin`: the card renders, and a fresh account submitted there lands on `/` with the navbar showing the email and a Sign out control.
3. `/records` while signed out: redirected to `/signin`.
4. `/records` while signed in: the table view is the default, the file list shows at least one dataset, and every dashboard canvas reports a non-zero width and height.
5. `/missing`: `main h1` reads `Not found`, and the back control returns to `/`.

Add a step here when a route ships.

## Preconditions

- Dev stack up: `make up`. `/` on 5373 and `/api/healthz` on 4100 must answer 200.
- No auth on `/`, `/signin`, `/signup`. `/records` needs a session: register through the form, or POST `/api/auth/register` and reuse the cookie. A redirect to `/signin` on `/records` is the signed-out path, not a bug.
- `playwright-mcp` must resolve on PATH, which means pi running inside the flake shell
  (`nix develop`/direnv). When it does not, the server fails at session start and `pi mcp list` says so.
- Adding or changing a server mid-session needs `/reload`.

## After a run

```sh
make lint   # biome write in both containers
make exec   # biome, tsc and audit in both containers
```

## Guardrails

- `.playwright-mcp/` and any `filename` result file are throwaway and gitignored: never commit them.
  Artifacts land relative to pi's cwd, so a run from another repo litters that tree.
- No host `npm install`.
