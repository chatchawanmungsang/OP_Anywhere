# OP Anywhere — Excel Data Collection (e-Claim)

Multi-user web app to import PROV SUM/DETAIL Excel workbooks into PostgreSQL tables defined by SQL schema files.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma
- Auth.js (NextAuth v5) credentials login
- Streaming XLSX parser (ZIP + Sheet XML) for large files up to 500MB
- **Scheduled night import**: upload stores files immediately; a separate worker imports into PostgreSQL overnight

## Tables (from SQL files)

| SQL file | PostgreSQL table | Excel files |
|---|---|---|
| `SQL-code-for-summary-table.sql` | `eclaim_transaction_summary` | `*SUM*.xlsx` (e.g. `PROV1_PROV2_RG07_SUM_6809_01.xlsx`) |
| `SQL-code-for-detail-table.sql` | `eclaim_transaction_data` | `*DETAIL*.xlsx` (e.g. `PROV1_PROV2_RG07_DETAIL_6809_01.xlsx`) |

- **SUM**: Sheet 1 only
- **DETAIL**: Sheet 1 + Sheet 2 (same headers, merged into one table)
- Headers must match the SQL column schema
- **PROV1 + PROV2 filter required** — only matching rows are imported

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL)

## Setup

1. Copy environment file:

```bash
cp .env.example .env
```

2. Start Postgres (host port **5433**):

```bash
docker compose up -d
```

3. Install, migrate, seed:

```bash
npm install
npx prisma migrate dev
npm run db:seed
```

4. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Default admin

- Email: `admin@example.com`
- Password: `admin123`

## Roles

| Capability | Admin | Manager | User |
|---|---|---|---|
| View Summary / Detail | yes | yes | yes |
| Upload Excel | yes | yes | no |
| Manage users | yes | no | no |
| Clear table data | yes | no | no |

## Upload rules

- Filename must contain `SUM` or `DETAIL` (not both)
- `.xlsx` only, max **500MB**
- Required on upload form: **ปี พ.ศ.**, **เดือน**, **งวด (1/2)**, **PROV1**, **PROV2**
- Upload is **fast** (file archived only); import runs **overnight** via worker
- Original files stored under `data/archive/{year}/{month}/period-{n}/`
- Filename pattern `_*6809_01.xlsx` auto-fills year 2568, month 9, period 1

## Scheduled night import

Upload creates a job with status `SCHEDULED`. Run the worker after midnight:

```bash
npm run worker:import
```

### Windows Task Scheduler (recommended)

1. Open **Task Scheduler** → Create Basic Task
2. Trigger: **Daily** at **00:05**
3. Action: Start a program
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -Command "cd C:\Users\kkpho\OP_Anywhere; npm.cmd run worker:import"`
4. Ensure Docker Postgres is running and `.env` is configured

### Environment

```env
IMPORT_SCHEDULE_HOUR=0
IMPORT_SCHEDULE_MINUTE=0
UPLOAD_ARCHIVE_DIR=./data/archive
WORKER_BATCH_SIZE=500
WORKER_MAX_JOBS_PER_RUN=1
```

Job statuses: `SCHEDULED` → `PROCESSING` → `SUCCESS` / `FAILED`

## Routes

- `/summary` — `eclaim_transaction_summary`
- `/detail` — `eclaim_transaction_data`
- `/upload` — import SUM/DETAIL files
- `/users` — admin user management

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:seed` | Seed admin user |
| `npm run worker:import` | Process due scheduled upload jobs |
| `npm run prune` | Interactive CLI — filter Excel files in `OP_Data` by PROV1/PROV2 and write pruned copies to `OP_Data/Pruned/` |

## Excel Prune (local CLI)

Filter SUM/DETAIL `.xlsx` files in `OP_Data` to rows where **PROV1** and **PROV2** match (default `4000`), **SUB_FUND** contains `WALKIN`, and **SUMS_COST** is `0`, one file at a time:

```powershell
npm run prune
```

If PowerShell blocks `npm` (`running scripts is disabled`), use either:

```powershell
npm.cmd run prune
```

```powershell
.\prune.cmd
```

Or open **Command Prompt (cmd)** and run `npm run prune` there.

- Source: `OP_Data/*.xlsx` (SUM = sheet 1, DETAIL = sheets 1–2)
- Output: `OP_Data/Pruned/{originalName}Prune.xlsx`
- Status tracking: `OP_Data/.prune-state.json` marks `[NEW]` vs `[DONE]`
- Uses streaming read/write (copies row XML directly) — low RAM even for 100MB+ files
- Live progress bar + spinner on one line; auto-pauses after 60 min (`PRUNE_MAX_MS`) and saves checkpoint
- Resume interrupted jobs via `[RESUME]` in the file list (checkpoint in `OP_Data/.prune-tmp/jobs/`)

Optional env vars: `OP_DATA_DIR`, `PRUNE_PROV1`, `PRUNE_PROV2`, `PRUNE_SUB_FUND_CONTAINS` (default `WALKIN`), `PRUNE_SUMS_COST` (default `0`), `PRUNE_TMP_DIR`, `PRUNE_MAX_MS` (default 3600000 = 1 hour per run).
