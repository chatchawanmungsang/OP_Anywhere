# OP Anywhere — Excel Data Collection (e-Claim)

Multi-user web app to import PROV SUM/DETAIL Excel workbooks into PostgreSQL tables defined by SQL schema files.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma
- Auth.js (NextAuth v5) credentials login
- Streaming XLSX parser (ZIP + Sheet 1 XML) for large files up to 500MB

## Tables (from SQL files)

| SQL file | PostgreSQL table | Excel files |
|---|---|---|
| `SQL-code-for-summary-table.sql` | `eclaim_transaction_summary` | `*SUM*.xlsx` (e.g. `PROV1_PROV2_RG07_SUM_6809_01.xlsx`) |
| `SQL-code-for-detail-table.sql` | `eclaim_transaction_data` | `*DETAIL*.xlsx` (e.g. `PROV1_PROV2_RG07_DETAIL_6809_01.xlsx`) |

Only **Sheet 1** is imported. Headers must match the SQL column schema.

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
- Sheet 1 headers validated against SQL schema
- Matching files **append** rows

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
