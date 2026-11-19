# MSBLR E-Directory — Build Spec (read fully before writing code)

Client: Maheshwari Sabha, Bengaluru. Product: E-Directory & Digital Business Directory (web first; Android/iOS later via Capacitor from the same web build).
Scope source: Scope of Work §2.1–2.15 (summarised in §9 below). UI reference: `design/Maheshwari_Sabha_UI_UX_Design_Concepts.pdf` (page numbers cited below) and `design/ui-ux-concepts.html` (exact markup/colours of every screen — open it and copy layouts).
**Default visual direction: C "Warm Community".** Directions A and B must be switchable at runtime with zero code changes (see §4).

## 1. Repo layout (npm workspaces — pnpm is NOT installed)

```
/package.json            workspaces: apps/*, packages/*; scripts below
/apps/api                Fastify 5 + Prisma 6 + PostgreSQL (TypeScript, ESM, tsx for dev)
  prisma/schema.prisma   FROZEN data model — do not edit; report needed changes
  prisma/seed.ts         roles, permissions, zones, categories, placements, settings, demo data
  src/server.ts          builds app (exported buildApp()) ; src/index.ts listens
  src/lib/               env, prisma, auth, rbac, audit, privacy, files, sms, push, pdf, excel, errors, pagination, fy
  src/modules/<name>/    routes.ts (default export FastifyPluginAsync) + service.ts + schemas.ts
  src/jobs/              cron jobs (node-cron), started from src/index.ts when JOBS_ENABLED=true
  test/                  vitest + app.inject() tests, one file per module
/apps/web                React 18 + Vite 6 + TypeScript + Tailwind 3.4 + React Router 6 + TanStack Query 5 + react-i18next
  src/app/               main.tsx, router.tsx, providers, theme.ts
  src/components/ui/     shared UI kit (see §5) — owned by the scaffold step
  src/components/layout/ MemberLayout, AdminLayout, AuthLayout, PublicLayout
  src/features/<name>/   pages + components + api hooks + routes.tsx + nav.ts + i18n/{en,hi}.json
  src/lib/               api client, auth store, format helpers, useT
/packages/shared         zod schemas + enums + permission constants shared by api and web
/scripts/dev-db.mjs      starts embedded PostgreSQL for local dev (package `embedded-postgres`), port 54329, data in .devdb/
/brand                   logo files (orange = primary, navy = alternate)
```

Root scripts: `npm run db:start` (embedded pg), `npm run db:migrate` (prisma migrate dev), `npm run db:seed`, `npm run dev` (api :4000 + web :5173 with Vite proxy `/api` and `/files` → :4000), `npm run typecheck`, `npm test`, `npm run build`.

**Dependencies are installed once by the scaffold step.** Module builders must NOT run `npm install` / add deps (parallel installs corrupt the lockfile). If something is truly missing, say so in your final report.

## 2. API conventions

- All routes under `/api`. Modules are auto-registered: `src/server.ts` globs `src/modules/*/routes.ts` and registers each with prefix `/api/<folder-name>`. Public (no-auth) endpoints live in module `public` (prefix `/api/public`).
- Validation with zod (`packages/shared`), parse `req.body/query/params` via helper `parse(schema, data)` that throws 400.
- Responses: success `{ data: ... }`; list `{ data: [...], total, page, pageSize }` (query `page` default 1, `pageSize` default 20, max 100). Errors: `{ error: { code, message, details? } }` thrown via `httpError(status, code, message)`.
- Auth: Bearer access JWT (15 min, `sub`=userId, `roles`, `perms`) from `Authorization` header. Refresh token = random 48 bytes, stored sha256-hashed in `Session`, rotated on each `/api/auth/refresh`; web keeps it in httpOnly cookie `msblr_rt` (path `/api/auth`), apps may send it in body.
- Decorators: `app.authenticate` (preHandler, sets `req.user = { id, personId, familyId, advertiserId, roles, perms, isHead, zoneIds }`), `requirePerm(...perms)` (any-of), `requireHead`.
- **Audit:** every create/update/delete/approve/reject calls `await audit(req, { action, entity, entityId, summary, before, after })` from `lib/audit.ts` (inside the same `prisma.$transaction` when there is one — pass `tx`). `action` format `entity.verb` e.g. `payment.approve`, `person.update`, `auth.login`. No route may update/delete `AuditLog`.
- **Privacy:** member-facing person data must go through `toPublicPerson(person, viewer)` in `lib/privacy.ts`. Hidden fields are omitted and listed in `hidden: string[]` so the UI can show the lock. Viewer sees everything for own family; staff with `members.view_private` see everything. Defaults when no PrivacySetting row: mobile/whatsapp/photo/business visible; email/address/dob/anniversary hidden. Search must only match name, membershipNo, zone, area, business name — never hidden fields.
- Files: `POST /api/files` multipart (`file`, `kind`, `visibility`) → `{data:{id,url}}`. Limits: images 5 MB (jpg/png/webp), pdf 10 MB, video mp4 20 MB. Stored at `UPLOAD_DIR/yyyy/mm/<uuid>.<ext>`. `GET /files/:id` streams: PUBLIC to anyone, MEMBERS to any logged-in user (access token in header or `?t=` short token), PRIVATE to owner or staff with relevant perm. Helper `fileUrl(id)`.
- Money: Prisma Decimal → serialise as number. Dates ISO strings. Indian FY helper `fyOf(date)` → `"26-27"`.
- OTP: `lib/sms.ts` interface `SmsProvider.sendOtp(mobile, code)`; `ConsoleSmsProvider` logs it. When `DEV_OTP_BYPASS=true`, code `123456` always works (never in production). Mobile normalised to 10 digits (strip +91/spaces). Limits: OTP valid 5 min, max 5 attempts, max 3 sends / 15 min / mobile.
- Push: `lib/push.ts` `sendPush(userIds, {title, body, data})` — FCM via firebase-admin if `FCM_SERVICE_ACCOUNT` set, else logs + marks delivery `no_token`. In-app notification inbox (Notification + NotificationDelivery) always works.
- Settings (`Setting` table, key → JSON): `theme` ("a"|"b"|"c"), `upi` ({id, payeeName, qrFileId}), `subscription` ({amount, yearMode:"FY"}), `trustedDeviceDays` (30), `businessApprovalRequired` (true), `contentStaleDays` (10), `wishTemplates` ({birthday:{en,hi}, anniversary:{en,hi}}), `receiptPrefix` ("R"), `sabha` ({name, nameHi, address, phone, email}).

### Permissions (constants in packages/shared/src/perms.ts)
`members.view_private, members.edit, registrations.approve, logins.approve, payments.verify, receipts.view, receipts.export, businesses.approve, events.post, highlights.post, trusts.edit, contacts.edit, banners.edit, ads.manage, ads.approve, notifications.send, reports.view, audit.view, roles.manage, settings.edit, dashboard.view`
Roles (seeded): `super_admin` (all), `admin` (all except roles.manage, settings.edit), `finance` (payments.verify, receipts.*, reports.view, dashboard.view), `content` (events.post, highlights.post, dashboard.view; zone-scoped via UserRole.zoneId), `ad_manager` (ads.*, banners.edit, reports.view, dashboard.view), `head`, `family_viewer`, `advertiser` (no staff perms). Any user with a staff role sees the Admin panel.

## 3. Web conventions

- Feature auto-registration: `src/app/router.tsx` uses `import.meta.glob('../features/*/routes.tsx', { eager: true })`; each exports `memberRoutes?`, `adminRoutes?`, `publicRoutes?` (RouteObject[]). Admin sidebar: `features/*/nav.ts` exports `adminNav: { to, labelKey, icon, perm?, group: 'overview'|'people'|'content'|'control', order }[]`. i18n: `features/*/i18n/{en,hi}.json` merged under namespace = feature name. Use `useTranslation('<feature>')`. Hindi strings must be real Hindi.
- Data: TanStack Query hooks per feature in `features/<x>/api.ts` using `src/lib/api.ts` (fetch wrapper adding Bearer, auto refresh on 401 once, throws `ApiError`). Mutations invalidate relevant keys and show toast (`useToast`).
- Forms: react-hook-form + zod resolver (schemas from packages/shared). Every form: labels, required markers, inline errors, disabled submit while pending.
- Every page handles: loading (Skeleton), empty (EmptyState), error (ErrorState with retry). No console errors. No `any` unless unavoidable.
- Responsive: mobile-first. Member area: < 1024px → top bar + bottom tab bar (Home, Members, Business, Events, Me) as in PDF p7 mobile; ≥ 1024px → Direction-C slim icon sidebar + top bar (PDF p7 desktop). Admin: sidebar ≥ 1024px, drawer below. Test at 375, 768, 1280.
- Accessibility: min body 16px on mobile, touch targets ≥ 44px, focus rings, alt text, aria-labels on icon buttons.
- Icons: `lucide-react`. Dates: dayjs. Toasts: own `Toast` in ui kit.

## 4. Theming (critical — client may switch A/B/C later)

- Never hard-code colours, fonts or radii in components. Use Tailwind tokens mapped to CSS variables only: `bg-bg, bg-surface, text-ink, text-muted, border-line, bg-primary, text-primary, bg-primary-2, bg-accent, text-accent, bg-accent-soft, rounded-theme (var(--r)), font-head, font-body`, plus semantic `success/warning/danger/info` (+ `-soft`).
- `src/app/theme.css` defines `[data-theme="a"|"b"|"c"]` variable sets (values from design HTML `.theme-a/.theme-b/.theme-c`; C primary tuned to logo orange `#C2501E`, accent `#2F6B4F`, gold `#C9A24A`). `<html data-theme>` is set from `/api/public/config` (`theme` setting), overridable by `?theme=a` for demos. Admin Settings page can change it.
- Layout differences between directions are limited to tokens + `ThemeVariant` helper (`useThemeVariant()` returns 'a'|'b'|'c') for the home hero only. Everything else is shared.
- Brand: logo `/brand/logo-orange.png` (primary, default), `/brand/logo-navy.png` (Direction B uses navy). App name "MSBLR E-Directory", tagline "Connect • Engage • Prosper".

## 5. UI kit (src/components/ui — built by scaffold, used by all)
Button (variants primary|accent|outline|ghost|danger|success; sizes sm|md|lg; loading), IconButton, Card, Input, Textarea, Select, DateInput, PhoneInput (+91 prefix), Checkbox, Toggle, RadioCards, ChipGroup, Badge (tones), Avatar (initials fallback, deterministic colour), Modal, Drawer, ConfirmDialog, Tabs, Table (sortable header, empty row), Pagination, SearchInput (debounced), FileUpload (drag/drop, preview, progress, uses POST /api/files), ImageWithFallback, Stepper, PageHeader, Section, StatCard, EmptyState, ErrorState, Skeleton, Toast/useToast, LangSwitch (EN/हिं), LockedField ("Hidden by member"), Carousel (auto-advance, dots, video support), AdSlot (`<AdSlot placement="WEB_SIDE" />` fetches `/api/ads/serve?placement=` and reports impressions/clicks; shows "AD" tag; renders nothing if empty).

## 6. Seed / demo data
Seed must create: all roles+perms, 5 zones (Zone 1 Chickpet … Zone 5 Whitefield), 12 business categories, ad placements (codes in schema comment) with sizes from PDF p22, settings defaults, and demo data: ~40 families with 2–5 persons each (Maheshwari surnames: Rathi, Somani, Daga, Mundra, Kabra, Bhutada, Laddha, Toshniwal, Bang, Jhanwar, Biyani, Malpani), businesses, 3 trusts, contacts (Police 112, Ambulance 108, Fire 101, Women helpline 1091 + placeholder Sabha numbers), events (past + upcoming), highlights, banners, 2 advertisers with live ads, payments in all states, receipts, notifications, audit rows.
Demo logins (dev bypass OTP 123456): super admin `9000000001`, finance `9000000002`, content (Zone 1) `9000000003`, ad manager `9000000004`, head of family `9845012345` (Ramesh Rathi, MSB-0412), activated family member `9900045678`, advertiser `9000000005`. Document these in README.

## 7. Quality bar ("bugless")
- `npm run typecheck` and `npm run build` pass with zero errors. `npm test` passes.
- Each API module ships `apps/api/test/<module>.test.ts` covering: happy path, auth required (401), forbidden role (403), validation (400), and privacy/ownership rules where relevant. Tests use `buildApp()` + `app.inject()` against database `msblr_test` (reset via `prisma migrate reset --force --skip-generate` in global setup + seed).
- Never trust client IDs for ownership — always derive family/person from `req.user`.
- All list endpoints paginated; all text search case-insensitive (`mode: 'insensitive'`).

## 8. Module ownership (parallel builders touch ONLY their folders)
| Builder | API modules (`apps/api/src/modules/…`) | Web features (`apps/web/src/features/…`) | Jobs |
|---|---|---|---|
| Scaffold | auth, files, public, me (profile basics), + all of src/lib, server, seed | auth, shell (layouts, home skeleton), ui kit | — |
| Members | members, family, registrations | members, family, registration, privacy | — |
| Payments | payments, receipts, subscriptions | payments, receipts (member + admin) | subscriptions.status |
| Content | business, trusts, contacts, events, highlights, banners, home | business, trusts, contacts, events, home (final home page) | content.staleness |
| Ads & Comms | ads, advertisers, notifications | ads (advertiser portal + admin), notifications (inbox + composer) | wishes.daily, ads.lifecycle, ads.rollup |
| Admin | dashboard, audit, reports, roles, settings, approvals (aggregator) | admin-dashboard, audit, reports, roles, settings, approvals | — |

## 9. Feature checklist (Scope of Work §2)
2.1 Head of family holds membership; family members as records; head requests login → admin approves → family member gets view-only login; head/admin can withdraw.
2.2 Mobile + OTP only; attempt/resend limits; trusted device N days (refresh token lifetime = trustedDeviceDays).
2.3 Online registration (head, family, photos, documents) → Pending → admin approve (auto membership no. `MSB-####`, next after max) / reject with remarks; duplicate mobile check.
2.4 UPI ID + QR shown; member uploads screenshot + UTR (unique) + amount + date; finance verifies; approval → Receipt with serial `R/26-27/0001` (gap-free counter row-locked in txn), PDF generated, notification with download link; receipt register (search member/date/amount/UTR, status history, Excel/CSV export); legacy receipt import (CSV); subscription status ACTIVE/DUE/EXPIRED per family + reminders.
2.5 Per-person per-field privacy toggles.
2.6 Member business profiles (optional admin approval setting); Business tab with search name/category/member/area; call / WhatsApp / directions.
2.7 Static contacts page (admin-edited list; no search/ads).
2.8 Trusts with attachments (files or links) shown on home.
2.9 Home: carousel (banner → ad → video, admin order/timing), Recent Highlights, trusts, announcements, active-member count strip, quick links Members/Business/Events/Trusts.
2.10 Events (AGM/EC notices, zone programmes, calendar, registration links), highlights after events, multiple content owners (content role, zone-scoped), staleness reminders, birthday/anniversary auto content, usage dashboard, role reassignment on committee handover.
2.11 Automated birthday & anniversary push wishes (head gets family members' too); Sabha-set text; opt-out.
2.12 Admin push to all/zone/list/single; saved templates; WhatsApp click-to-chat with prefilled text (`https://wa.me/91XXXXXXXXXX?text=`).
2.13 Ads: advertiser request → upload with sizing guide → admin preview in placement template → approve/return with remarks; placements per PDF p22; schedule (start/end), priority, shuffle/rotation, pause/replace/renew; plans monthly/quarterly/half-yearly/yearly with rates; manual payment verification (same flow as 2.4); analytics impressions/viewers/clicks per ad for admin and advertiser (own ads only).
2.14 Admin dashboard (pending approvals, payments to verify, ads, events, usage); full activity log with old/new values and filters; monthly & long-term reports exportable Excel/CSV/PDF; role-based access.
2.15 Docker/VPS deploy files (`deploy/`), backups script, README.

NOT in scope (do not build): Mangal Parinay / matrimonial, payment gateway, SMS/WhatsApp sending of wishes.
