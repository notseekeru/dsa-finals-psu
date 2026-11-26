# DataSpace: A Records Workspace for Small Business Data

## A. Project Overview

### Business background and context

DataSpace is a records workspace for any small business whose data lives in spreadsheets. It assumes no trade. A hardware shop imports stock rows, a clinic imports patient visits, an office imports an employee master list, and the same workspace builds its table, filters, form and charts from whatever columns that file has.

The starting point is the ordinary export. The business already keeps a spreadsheet, and the CSV holds the truth about stock, patients or staff. DataSpace gives that file a database and three operations the spreadsheet cannot show: a sort that reports its comparisons and shifts, a search that reports how many records it inspected, and a dashboard that reads the file's own columns.

### Identified problem

Small businesses keep records in CSV files and cannot search, sort or summarise them without manual spreadsheet work, and every new export has different columns. Search is visual, so finding a partial name means scanning rows. A fixed form breaks on the next file because the columns moved. Sorting is silent, so nobody can tell whether it took 40 comparisons or 4,000. DataSpace answers all three: sorting and search run on the server with counted operations, and the schema keeps the file's own headers beside the fields the interface relies on.

### Target users

| User          | File they bring                                    |
| ------------- | -------------------------------------------------- |
| Hardware shop | Stock rows: item, quantity, price, supplier        |
| Clinic        | Patient rows: name, visit date, doctor, fee        |
| Office        | Employee list: name, department, salary, hire date |

Each needs the same three operations.

### System flow

![System flow from opening the app to deleting an imported file](docs/images/system-flow.png)

_Each step names the module or endpoint that does it, so the flow doubles as a map of the codebase._

The router mounts a view for the current path. Signing in sets an HttpOnly session cookie, and the workspace loads that user's records and files. The user types a record or imports a CSV: the browser parses the file, proposes a mapping for name, amount, date, category, status and record ID from the headers, and shows it for correction before anything is written. Importing creates a dataset, then inserts the rows in one transaction. The result is a sortable table, a dashboard built from the file's columns, and add, edit, archive and delete actions.

### Screenshots of the working program

![Landing page of DataSpace](docs/images/landing.png)

_The banner names the product and its three operations._

![Sign-in page](docs/images/signin.png)

_The same form module serves sign-in and sign-up; the session lasts seven days._

![Records table with sort metrics and highlights](docs/images/workspace-table.png)

_The status line reads `Insertion Sort (name, asc): 1121 comparisons, 1055 shifts` over the 70 imported records it just reordered. The sidebar lists both sample files, and selecting one scopes the table, charts and filters to it._

![Dashboard charts](docs/images/workspace-charts.png)

_The panels pick their own columns: `hire_date` becomes the monthly line, `office` the grouping, `monthly_salary_php` the measure._

![Add record form](docs/images/add-record.png)

_Fields follow the selected file's columns; "All records" falls back to the core fields. The same dialog accepts a CSV._

## B. Technical Design

### Data structure used and why

The client is vanilla JavaScript built with Vite; the server is Hono on Node with `pg`; `node-pg-migrate` owns the schema. There is no client framework and no ORM.

**Dynamic array.** Listing a user's records returns one array of `BusinessRecord` objects. Insertion sort copies that array once and reorders it in place, shifting elements instead of rebuilding a list, so the same array is the input, the working set and the response.

**Hash map.** Column work is keyed lookup. `records.data` is an object keyed by the file's headers, so any extra field is one key access. The importer builds a `Map` from header to column index, so mapping 5,000 rows does not rescan the header row per cell. The dashboard profiles columns with `Set` and tallies groups in `Map`.

Only one structure is needed on the server because Postgres owns persistence: no index to sync, no cache to invalidate. The pair that keeps the app column agnostic is `records.data` (jsonb, one object per row) and `datasets.columns` (jsonb, the ordered headers). The six core columns stay as real columns, because sorting and totals need them; every other field is read from `data` by name.

### Algorithm used and why

`backend/src/features/records/dsa.ts` holds three functions, and the interface prints what each did.

**Insertion sort** sorts ascending or descending on any field. It resolves a key per record (`amount` as a number, `date` as a timestamp, other core fields as text, and any extra column from `data[field]`), counts comparisons and shifts, and keeps nulls last. It is stable because only strictly greater elements shift.

**Linear search** scans every record, counts those inspected, and returns all rows whose field contains the query as a case-insensitive substring. It is the default because a user typing `an` wants every match.

**Binary search** needs a sorted array: each comparison decides which half to discard, so unsorted input sends the search into the wrong half. The server sorts first, then halves the range and counts steps. It matches exactly, so `Alfonso` finds a row and `Alf` does not, which is why linear search handles partial matches.

Insertion sort is chosen for four reasons. The exam requires a visible algorithm, and this one exposes its work as counters the API returns and the status line prints. Imported files are nearly sorted, because exports arrive in date order and users append rows, and it is O(n) on nearly sorted input with O(n²) worst case. It is stable and in place, so equal keys keep their imported order. A built-in sort would hide all of that.

### Database schema

![Entity relationship diagram for users, sessions, datasets and records](docs/images/erd.png)

_Four tables and four cascading foreign keys, all reached from `users`._

| Table      | Column                                    | Type          | Constraint                               |
| ---------- | ----------------------------------------- | ------------- | ---------------------------------------- |
| `users`    | `id`                                      | uuid          | pk, `gen_random_uuid()`                  |
|            | `email`                                   | text          | not null, unique                         |
|            | `password_hash`                           | text          | not null                                 |
|            | `created_at`                              | timestamptz   | not null, default `now()`                |
| `sessions` | `id`                                      | uuid          | pk                                       |
|            | `user_id`                                 | uuid          | not null, references `users`, cascade    |
|            | `token_hash`                              | text          | not null, unique                         |
|            | `expires_at`                              | timestamptz   | not null                                 |
|            | `created_at`                              | timestamptz   | not null, default `now()`                |
| `datasets` | `id`                                      | uuid          | pk                                       |
|            | `user_id`                                 | uuid          | not null, references `users`, cascade    |
|            | `name`                                    | text          | not null                                 |
|            | `columns`                                 | jsonb         | not null, default `[]`                   |
|            | `created_at`                              | timestamptz   | not null, default `now()`                |
| `records`  | `id`                                      | text          | pk, generated `randomUUID()`             |
|            | `user_id`                                 | uuid          | not null, references `users`, cascade    |
|            | `dataset_id`                              | uuid          | not null, references `datasets`, cascade |
|            | `record_id`, `name`, `category`, `status` | text          | not null                                 |
|            | `amount`                                  | numeric(12,2) | not null, default 0                      |
|            | `date`                                    | text          | not null, ISO `YYYY-MM-DD`               |
|            | `archived`                                | boolean       | not null, default false                  |
|            | `data`                                    | jsonb         | not null, default `{}`                   |
|            | `created_at`                              | timestamptz   | not null, default `now()`                |

The indexes follow the queries. Unique indexes on `users.email` and `sessions.token_hash` make sign-in and session lookup single-row reads; `sessions_user_id_index` supports the cascade. `idx_records_user_created` and `idx_datasets_user_created` are composite `(user_id, created_at)` indexes, matching list queries that filter by owner and order by time.

One dataset is one imported file: the name is the file name, `columns` is the header row, and manual entries go into a dataset named `Manual entries`. The migrations are `auth`, `records`, then `datasets`, which adds `dataset_id` and `data`, backfills existing rows into an `Earlier records` dataset, then sets `dataset_id` to not null.

### Connection between code and database

![Path from a browser action through the API to Postgres](docs/images/data-connection.png)

_One HTTP client, one session check, one pool: the browser action and the SQL statement are two ends of one request._

`frontend/src/shared/api.js` is the only caller of `/api`, so headers and error shapes are handled once. The API surface is `GET /api/healthz`, `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`, `GET|POST /api/datasets`, `DELETE /api/datasets/:id`, `GET|POST /api/records`, `POST /api/records/bulk`, `PUT|DELETE /api/records/:id`, `POST /api/records/sort`, `GET /api/records/search` and `GET /api/records/stats`.

The handlers reach Postgres through the `pg` pool in `backend/src/shared/db.ts` with parameterised SQL. Ownership comes from the session, not the payload: `requireUser` reads the HttpOnly `session` cookie, hashes the token, joins it to `users`, and puts `userId` on the context. Every record and dataset statement scopes to `user_id` from that context, and a dataset id in a body is accepted only after a query confirms it belongs to that user. Bulk import, a record update and a dataset delete run in a transaction; the update locks its record and the delete locks its dataset with `SELECT ... FOR UPDATE` first. Reads load rows for the array algorithms or aggregate in SQL for stats.

Migrations run before the server listens, under a Postgres advisory lock; a failed migration exits instead of serving a mismatched schema.

## C. Reflection

### Challenges encountered

**A fixed schema fought the requirement.** The first migration created `records` with fixed columns, the shape the problem is not. The second added `datasets`, `dataset_id` and `data`, backfilled existing rows into a synthetic dataset, then added the not-null constraint. Real columns beside jsonb was the compromise: real values where sorting and sums need them, jsonb where the file's headers go.

**CSV files are not clean.** The messy sample has a quoted comma inside `"Full Name (Last, First)"`, duplicate record IDs, and rows with more cells than headers. The parser is a character-level state machine, so quoted commas and doubled quotes survive; amounts are cleaned to digits, sign and point; dates accept ISO or fall back to `Date.parse`; cells past the header count are flagged. Header detection is a guess: `Monthly_Salary` and `Dept / Team` match no alias, so those fields were mapped by hand before the import committed.

**Metrics had to be real.** Counting comparisons inside the loop was easy. Keeping the count correct while shifting in place forced a separate shift counter; a swap-based loop would have reported the wrong cost.

**Every read loads the whole set.** Sorting in TypeScript is what makes the counters possible and also the limit: past a few thousand rows the request should page, not sort in memory. An `AI HERE` note marks that ceiling.

### Lessons learned

Complexity needs a counter, not a label. O(n²) is a shape; the printed shifts are evidence, and nearly sorted input explains why the sort feels instant.

A schema can be flexible without losing types: the typed core columns and the jsonb column each own one job.

### Recommendations

- Add keyset paging and move sorting into SQL past a few thousand rows, keeping insertion sort for the demonstration view.
- Remember each dataset's confirmed mapping, so a repeated file shape imports without review.
- Add a fuzzy full-text index for partial search instead of scanning the array.
- Add CSV export of the current sorted, filtered view.

## Appendix: Rubric Mapping

| Criterion                                              | Where answered | Evidence                                                      |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------- |
| Problem, background, target users                      | A              | Three user profiles, the export problem, the operations added |
| Data structures: choice and correctness                | B              | Dynamic array, hash map, why one server structure is enough   |
| Algorithms: correctness and efficiency                 | B              | Insertion sort, linear and binary search, counted work        |
| Database design and integration                        | B              | ERD, schema table, session-scoped parameterised SQL           |
| System functionality: runs, solves the problem, usable | A, How to run  | 70 imported records, printed metrics, five screens            |
| Documentation completeness and accuracy                | All            | Eight figures, schema table, rubric map                       |

## How to Run

1. Run `cp .env.example .env`. That file only holds the local Postgres credentials and ports.
2. Run `make up`. Compose starts Postgres, the backend and the frontend, and injects `DATABASE_URL` pointing at the `postgres` service. Do not put a database URL in `backend/.env`; a stale value there is how a local session ends up writing to a shared database.
3. Open `http://localhost:5373`. The backend applies pending migrations at startup under a Postgres advisory lock, so the schema exists after the first boot.
4. Sign up, then import `docs/unsorted_but_not_chaotic.csv` or `docs/chaotic_data.csv`.

Without Docker, export the URL yourself and let the same startup migration run: `DATABASE_URL=... npm run dev` in `backend/`, and `npm run dev` in `frontend/`.
