# MSBLR E-Directory

E-Directory and Digital Business Directory for Maheshwari Sabha, Bengaluru. Web first (React PWA); Android/iOS later via Capacitor from the same build.
The contract for all modules is in `docs/BUILD_SPEC.md`; the data model is `apps/api/prisma/schema.prisma`.

## Setup (Windows / macOS / Linux, Node 20+)

PostgreSQL does not need to be installed: `npm run db:start` runs an embedded PostgreSQL 18 (package `embedded-postgres`) on port **54329**, data in `.devdb/`.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # already present on a fresh scaffold checkout
npm run db:start      # terminal 1 — leave running (Ctrl-C stops it). Creates DBs msblr and msblr_test
npm run db:migrate    # terminal 2 — prisma migrate dev (applies prisma/migrations)
npm run db:seed       # reference + demo data (idempotent: wipes all tables, then re-inserts)
npm run dev           # API http://localhost:4000 + web http://localhost:5173 (Vite proxies /api and /files)
```

Other scripts: `npm run typecheck`, `npm test` (needs the DB running), `npm run build`, `npm run db:reset`.
`node scripts/make-brand.mjs` regenerates `apps/web/public/brand/*` from `brand-src/`.

Tests reset `msblr_test` with `prisma migrate reset --force --skip-generate` (which re-seeds) before running.
**Note:** Prisma refuses to run `migrate reset` when it detects an AI agent unless the user consents explicitly, so run `npm test` yourself in a terminal.

### Demo logins (OTP `123456` while `DEV_OTP_BYPASS=true`)

| Mobile | Who |
|---|---|
| 9000000001 | Super admin |
| 9000000002 | Finance |
| 9000000003 | Content manager (Zone 1 only) |
| 9000000004 | Ad manager |
| 9000000005 | Advertiser (Mundra Steel) |
| 9845012345 | Head of family — Ramesh Rathi, MSB-0412 |
| 9900045678 | Activated family member — Sunita Rathi |

Open `http://localhost:5173/?theme=a` (or `b`, `c`) to preview the other design directions; the Admin Settings page changes the default.

## Architecture

```
apps/api      Fastify 5 + Prisma 6 + PostgreSQL, TypeScript (tsx)
  src/server.ts        buildApp(): helmet, cors, cookie, multipart, rate-limit, error handler; auto-registers src/modules/*/routes.ts at /api/<folder>
  src/lib/             env, prisma, auth, audit, privacy, files, sms, push, pdf, excel, errors, pagination, fy, parse, settings
  src/modules/         auth, files, public, me (+ one folder per feature module)
  src/jobs/            node-cron jobs (default export (app) => void), started when JOBS_ENABLED=true
  prisma/              schema, migrations, seed.ts
  test/                vitest + app.inject() on msblr_test
apps/web      React 18 + Vite 6 + Tailwind 3.4 + React Router 6 + TanStack Query 5 + react-i18next (PWA)
  src/app/             main, router (glob of features/*/routes.tsx), theme (CSS variable sets a|b|c), i18n
  src/components/ui/   shared UI kit    src/components/layout/  Member / Admin / Auth / Public layouts
  src/features/<x>/    routes.tsx, nav.ts, i18n/{en,hi}.json, pages, api.ts
packages/shared  zod schemas, permission constants
scripts/         dev-db.mjs (embedded Postgres), make-brand.mjs
```

Key behaviours: mobile + OTP login only; 15-minute access JWT, rotating refresh token in httpOnly cookie `msblr_rt`; every write is audited; member-facing person data goes through `toPublicPerson`; files are served by `GET /files/:id` with PUBLIC / MEMBERS / PRIVATE checks.
Not in scope: matrimonial, payment gateway, SMS/WhatsApp sending of wishes.
