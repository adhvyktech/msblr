# MSBLR E-Directory — Architecture

Status: draft v1, 12 Nov 2026 (project Day 7). Source of truth for scope: *Scope of Work, 31 Oct 2026* (§2.1–2.15).
Anything not in that document is a change request.

---

## 1. Guiding constraints

| Constraint | Consequence for the design |
|---|---|
| One developer, 38 days, demo on Day 25 (30 Nov) | One language (TypeScript) end to end, one repo, boring proven libraries, no microservices. |
| Web + Android + iOS "from the same codebase" | React PWA wrapped with **Capacitor** for the store apps. No React Native. |
| One Hostinger KVM 2 VPS (2 vCPU, 8 GB RAM, 100 GB NVMe) | Everything runs on one box with Docker Compose. Postgres doubles as the job queue, so there is no Redis. |
| ~1,400 families, maybe 5–6k people | Small data. Optimise for correctness and auditability, not scale. |
| Member data is sensitive (NDA §4) | Privacy rules are enforced in the API, never only in the UI. Private files are served only to authorised users. Every write is logged. |
| Handover of code, database and credentials on final payment | Everything is reproducible from the repo plus a `.env`. No vendor lock-in beyond FCM and the SMS provider. |

---

## 2. High-level picture

```
 ┌──────────────────────┐   ┌──────────────────────┐
 │  Browser / PWA       │   │ Android / iOS app    │
 │  msblr.com           │   │ (Capacitor shell     │
 │                      │   │  around same build)  │
 └─────────┬────────────┘   └─────────┬────────────┘
           │  HTTPS  /api/*           │
           ▼                          ▼
 ┌─────────────────────────────────────────────────┐
 │ Caddy (auto HTTPS, static web build, /api proxy,│
 │        /files auth-checked via api)             │
 └─────────┬───────────────────────────────────────┘
           ▼
 ┌──────────────────┐     ┌──────────────────────────┐
 │ api (Fastify)    │◄───►│ PostgreSQL 16            │
 │ REST + auth +    │     │ data + pg-boss job queue │
 │ RBAC + audit     │     └──────────────────────────┘
 └───┬──────────────┘                ▲
     │ enqueue                       │
     ▼                               │
 ┌──────────────────┐   ┌────────────┴─────────────┐
 │ worker (pg-boss) │──►│ /data/uploads (volume)   │
 │ crons, PDFs,     │   └──────────────────────────┘
 │ push, reminders  │──► FCM (push)   ──► SMS provider (OTP)
 └──────────────────┘
 nightly: pg_dump + uploads tarball → off-server copy
```

Containers: `caddy`, `api`, `worker`, `postgres`. The worker uses the same image as `api` with a different entrypoint.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language, shared types. |
| Repo | pnpm workspaces monorepo | `apps/web`, `apps/api`, `packages/shared`. |
| Web | React 18 + Vite + React Router + TanStack Query | Fast to build. Query caching suits list-heavy screens. |
| UI | Tailwind + shadcn/ui components | Quick, consistent admin and member screens; easy to give it the Sabha's colours. |
| PWA | `vite-plugin-pwa` | Installable, offline shell. |
| i18n | `react-i18next` with `en.json` and `hi.json` | UI strings only. Member-entered data stays as typed. |
| Store apps | Capacitor 6 (+ push-notifications, preferences, share, filesystem plugins) | Wraps the same `dist/`; native push through FCM/APNs. |
| API | Fastify + Zod (schemas in `packages/shared`) | Validation shared with the forms. |
| ORM | Prisma + Postgres 16 | Fast schema iteration. Its query extensions are the hook for the audit log. |
| Jobs | pg-boss | Cron and queues on Postgres; no extra service. |
| PDF | pdfkit + Noto Sans / Noto Sans Devanagari fonts | Receipts, reports. |
| Excel/CSV | exceljs | Report and register exports. |
| Push | Firebase Cloud Messaging (firebase-admin) | Free. Covers web push, Android and iOS (via APNs key). |
| OTP SMS | MSG91 (or similar Indian DLT-compliant provider), behind an `SmsProvider` interface | DLT registration is mandatory for SMS in India; see risks. |
| Proxy/TLS | Caddy | Automatic Let's Encrypt; simpler than nginx + certbot. |
| Deploy | Docker Compose on the VPS, deploy by `git pull && docker compose up -d --build` | Simple, and easy to hand over. |

---

## 4. Repository layout

```
Code/
  apps/
    web/            React PWA (+ capacitor.config.ts, android/, ios/)
      src/
        features/   members/ family/ auth/ payments/ business/ events/
                    trusts/ ads/ admin/ home/ contacts/
        i18n/       en.json hi.json
    api/
      src/
        modules/    same feature split; each = routes.ts service.ts
        lib/        auth, rbac, audit, privacy, files, sms, push, pdf
        jobs/       wishes.ts reminders.ts adExpiry.ts subscriptions.ts backups.ts
      prisma/       schema.prisma migrations/ seed.ts
  packages/
    shared/         zod schemas, enums, permission names, types
  deploy/
    docker-compose.yml Caddyfile backup.sh restore.md
  docs/
    ARCHITECTURE.md (this file)
```

---

## 5. Identity, auth and roles

### Login (§2.2)
1. `POST /auth/otp/request {mobile}`. Rate limits: 3 sends per 15 minutes per mobile, 10 per hour per IP. The OTP is stored hashed with a 5-minute expiry and at most 5 attempts.
2. `POST /auth/otp/verify {mobile, otp, deviceName}` returns a **15-minute access JWT** and a **refresh token** (random, stored hashed in `sessions`, valid for 30 days, rotated on every use).
3. Web keeps the refresh token in an `httpOnly; Secure; SameSite=Strict` cookie. The Capacitor apps keep it in secure storage and send it in a header.
4. "Trusted device" means the refresh token stays valid for N days (an admin setting). A member can see and revoke their sessions, and an admin can revoke all of a user's sessions.

Only these may log in: a **head**, a **family member whose login was activated** (head requests, admin approves), **staff** (admins), and **advertisers**. A dev-only OTP bypass is controlled by an env flag and is off in production.

### Roles and permissions (§2.14)
Permissions are code-level strings (e.g. `payments.verify`, `members.edit`, `ads.approve`, `events.post`, `audit.view`, `roles.manage`). Roles are rows that bundle permissions, so the Sabha can reshape them without code changes.

Seeded roles:

| Role | Typical holder | Can do |
|---|---|---|
| `super_admin` | Secretary / tech owner | Everything, including role assignment and committee handover |
| `admin` | Office-bearers | Approvals, members, events, notifications |
| `finance` | Treasurer | Verify payments, receipts, register exports |
| `content` | Zone coordinators, committee members | Post events and highlights only, optionally limited to their zone |
| `ad_manager` | Ad committee | Ads, plans, placements, ad analytics |
| `head` | Member | Edit own family, privacy, businesses, pay |
| `family_viewer` | Activated family member | View own family only |
| `advertiser` | Outside or member advertisers | Own ad requests, uploads, payments, stats |

One user can hold several roles; for example, a head can also be the treasurer. Committee handover (§2.10) is a screen that moves roles from one user to another and writes to the audit log.

---

## 6. Data model (core tables)

```
zones(id, name)

families(id, membership_no UNIQUE NULL, zone_id, address..., status[pending|active|rejected|inactive],
         subscription_status[active|due|expired], subscription_valid_until, created_at)

persons(id, family_id, is_head, name, relation, dob, anniversary, gender, mobile, email,
        education, occupation, blood_group, photo_file_id, deleted_at)

users(id, person_id NULL, advertiser_id NULL, mobile UNIQUE, status, last_login_at)
user_roles(user_id, role_id, zone_id NULL)        roles(id, name)  role_permissions(role_id, perm)
sessions(id, user_id, refresh_hash, device_name, platform, expires_at, revoked_at)
otp_requests(id, mobile, otp_hash, expires_at, attempts, ip)
login_activation_requests(id, person_id, requested_by, status, decided_by, remarks)

privacy_settings(person_id, field, visible BOOL)  -- field ∈ mobile|email|address|photo|dob|business...
                                                  -- defaults: mobile/address hidden (Sabha to confirm)

registrations(id, family_id, submitted_at, status, decided_by, decided_at, remarks)
files(id, owner_user_id, kind, path, mime, size, visibility[public|members|private], created_at)

payments(id, kind[subscription|ad], family_id NULL, ad_order_id NULL, amount, utr UNIQUE,
         paid_on, screenshot_file_id, status[pending|approved|rejected], verified_by, remarks)
receipts(id, payment_id UNIQUE, serial_no UNIQUE, fy, issued_at, pdf_file_id, legacy BOOL)
receipt_counters(fy PRIMARY KEY, last_no)         -- gap-free serials, row lock in txn

businesses(id, family_id, person_id, name, category_id, description, address, area, phone,
           website, maps_url, logo_file_id, status[pending|approved|hidden])
business_photos(business_id, file_id)    business_categories(id, name_en, name_hi)

static_contacts(id, section, name, phone, details, sort)          -- §2.7, admin-edited

trusts(id, name, details, sort)          trust_attachments(trust_id, file_id NULL, url NULL, label)

events(id, title, body, zone_id NULL, kind[agm|ec|social|religious|cultural|other],
       starts_at, ends_at, venue, registration_url, status[draft|published])
highlights(id, event_id NULL, title, summary, published_at, author_id)
highlight_media(highlight_id, file_id, sort)

banners(id, kind[banner|ad|video], file_id, ad_id NULL, sort, duration_ms, active_from, active_to)

advertisers(id, name, contact_person, mobile, email, member_family_id NULL)
ad_plans(id, name, period[monthly|quarterly|half_yearly|yearly], placement_id, price)
ad_placements(id, code, platform[web|app|both], width, height, max_kb, formats, video_max_s)
ad_requests(id, advertiser_id, placement_id, plan_id, status[requested|content_submitted|
            approved|returned|live|paused|expired], remarks)
ads(id, request_id, creative_file_id, click_url, click_type[call|whatsapp|web],
    priority, starts_at, ends_at, status)
ad_stats_daily(ad_id, date, impressions, clicks_call, clicks_whatsapp, clicks_web,
               unique_viewers)  PK(ad_id,date)
ad_views(ad_id, date, viewer_key) PK(...)        -- for unique viewers; pruned after 90 days

notifications(id, title, body, audience[all|zone|list|single], audience_ref, sent_by, sent_at)
notification_deliveries(notification_id, user_id, status)
device_tokens(user_id, token UNIQUE, platform, updated_at)
wish_templates(kind[birthday|anniversary], text_en, text_hi)
wish_log(person_id, kind, year)  PK                -- idempotent daily job

audit_log(id, at, actor_user_id, actor_role, action, entity, entity_id,
          before JSONB, after JSONB, ip, user_agent)   -- append-only
settings(key, value JSONB)   -- trusted-device days, approval toggles, UPI ID, QR file, reminder days
```

Points to note:
- **Membership number** is assigned inside the approval transaction from a sequence. Its format (e.g. `MSB-1234`) must match the numbers the Sabha already uses; existing members are imported with their current numbers.
- **Duplicate mobile check (§2.3):** `users.mobile` is unique. On `persons.mobile`, a non-unique index plus a warning, because family members often share a phone.
- **Legacy receipts** are imported with `legacy = true` and keep their old serial numbers. The new series starts after the highest imported number, or uses a new prefix. The Sabha decides which.
- **Soft deletes** apply to persons, businesses and ads, so the audit log and history still resolve.

---

## 7. Cross-cutting mechanisms

### Audit log (§2.14)
- A Prisma client extension wraps `create/update/delete/upsert` on the audited models. It reads the "before" row, runs the change, and writes an `audit_log` row in the **same transaction**. Request context (actor, IP, role) comes from `AsyncLocalStorage`.
- Non-data events such as login, logout, OTP failures, approvals and exports are written explicitly with `audit.log(action, ...)`.
- No API route updates or deletes `audit_log` rows; the database role used by the app has only `INSERT, SELECT` on that table.
- Monthly reports are queries on `audit_log` grouped by actor and action, exported with exceljs or pdfkit.

### Privacy enforcement (§2.5)
- One serializer, `toPublicPerson(person, viewer)`, removes hidden fields unless the viewer is in the same family or has the `members.view_private` permission. Every member-facing list or search endpoint goes through it, and a unit test asserts hidden fields never leak.
- Search runs only on non-private fields (name, zone, business), so searching cannot be used to find a hidden phone number.

### Files
- Uploads are stored on disk at `/data/uploads/{yyyy}/{mm}/{uuid}.{ext}`, sized and EXIF-stripped with `sharp`. Video gets a size and length check only; no transcoding.
- **Public** files (banners, approved ads, trust PDFs, highlights, logos) are served directly by Caddy.
- **Private** files (payment screenshots, registration documents, member photos when hidden) go through `GET /api/files/:id`, which checks permissions and then streams the file. Caddy `X-Accel`-style offloading isn't needed at this size.
- Limits: images up to 5 MB, PDFs up to 10 MB, ad video up to 20 MB. Disk usage is shown on the admin dashboard.

### Payments and receipts (§2.4)
1. The member sees the UPI ID and QR code from `settings`. On mobile there is also a `upi://pay?pa=...&am=...&tn=MSB-<membership_no>` deep link.
2. The member uploads a screenshot and the UTR. The UTR is unique, so a reused reference is rejected.
3. The finance user opens a queue showing the screenshot, UTR, amount and member, compares it with the bank statement, and approves or rejects it.
4. On approval, one transaction: payment approved, next receipt serial locked from `receipt_counters`, receipt row written, subscription extended, audit written. Afterwards a job renders the PDF and sends a push notification with the download link.
5. The register supports filters (member, date range, amount, UTR, status) and exports to Excel/CSV.

### Jobs (pg-boss worker)
| Job | Schedule | Notes |
|---|---|---|
| `wishes.daily` | 08:00 IST | Finds today's birthdays and anniversaries, notifies the head (and the person, if activated), writes `wish_log` so it never sends twice. |
| `subscriptions.status` | 00:30 IST | Updates active/due/expired; renewal reminders at T-30 and T-7 days. |
| `ads.lifecycle` | hourly | Starts and expires ads; renewal reminders to advertiser and admin. |
| `ads.rollup` | every 10 min | Folds raw impression and click events into `ad_stats_daily`. |
| `content.staleness` | 09:00 IST | If nothing has been posted for N days, reminds the content owners (§2.10). |
| `receipt.pdf`, `push.send` | on demand | Queued from the API. |
| `backup.nightly` | 02:00 IST | `pg_dump` plus an uploads tarball; 14 daily and 8 weekly copies kept; copied off the server. |

### Ad tracking
- The client batches impressions: one `POST /api/ads/events` per screen with the ad IDs actually rendered in view (IntersectionObserver). Clicks are logged before the call, WhatsApp or web action opens.
- A unique viewer is a logged-in user ID, or a random device ID for anonymous web visitors.
- Advertisers see only `ad_stats_daily` rows for their own ads.

### Notifications
- Device tokens are registered after login: Capacitor push on the apps, FCM web push for the installed PWA.
- Audiences are all, a zone, a list or a single member. Each send is audit-logged, and deliveries are recorded.
- The WhatsApp button (§2.12) is client-only: `https://wa.me/91XXXXXXXXXX?text=<encoded template>`.

### Home page
- One `GET /api/home` call returns carousel items, highlights, trusts, the active-member count and announcements, cached for 60 seconds in memory.

---

## 8. Mobile apps (Capacitor)

- `apps/web` builds once; `npx cap sync` copies `dist/` into `android/` and `ios/`. The app calls `https://msblr.com/api`, and the API's CORS allows the `capacitor://localhost` and `https://localhost` origins.
- Native features are push notifications, the share sheet (for receipts), opening `tel:`, `wa.me` and maps links, camera and file upload, the splash screen with an app-loading-screen ad slot (§2.13), and a status bar in the Sabha's colours.
- Building iOS needs a Mac (yours, a borrowed one, or a cloud Mac or CI service such as Codemagic). Plan this before Day 26.
- **App Store guideline 4.2 (minimum functionality):** apps that are thin web wrappers get rejected. Native push, camera upload, share and an offline shell usually get past this, so ship with those turned on from the first submission.

---

## 9. Deployment and operations

- **Server hardening (do first):** create a non-root sudo user, log in with SSH keys, set `PermitRootLogin no` and `PasswordAuthentication no`, firewall (`ufw`) allowing only 22, 80 and 443, `fail2ban`, unattended security upgrades. Change the root password that is currently stored in a plaintext file, then delete that file.
- **DNS (GoDaddy):** an `A` record for `msblr.com` and `www` pointing to the VPS IP. Optionally `staging.msblr.com` for the demo.
- **Environments:** `staging` and `prod` as two Compose projects on the same VPS (different databases and ports). The Day 25 demo runs on staging.
- **Secrets:** `.env` on the server only, never committed. `.env.example` lives in the repo.
- **Backups:** `deploy/backup.sh` runs nightly, and `deploy/restore.md` is tested once before launch (§2.15 promises a restore process). For the off-server copy, check whether Hostinger's VPS snapshot covers it; if not, rclone to the Sabha's Google Drive (free).
- **Monitoring:** UptimeRobot (free) on `/api/health`. Error logs are JSON from Fastify, rotated by Docker.

---

## 10. Build order against the calendar

Day numbers follow the tracker (Day 1 = 6 Nov). Today is Day 7.

| Window | Dates | Build |
|---|---|---|
| Days 7–9 | 12–14 Nov | Repo scaffold, Compose, CI-less deploy to staging, server hardening, Prisma schema v1, OTP login (dev bypass), RBAC, audit extension, i18n skeleton. **Clickable prototype to the Sabha (already overdue).** |
| Days 10–14 | 15–19 Nov | Family and person management, privacy, registration and approval, admin member screens, legacy Excel import script. |
| Days 15–18 | 20–23 Nov | Payments, receipts (PDF, counters), receipt register and export, subscription status job. |
| Days 19–21 | 24–26 Nov | Business directory and tab, static contacts, trusts, events and highlights, home page and carousel. |
| Days 22–24 | 27–29 Nov | Ads (requests, review preview, placements, lifecycle, tracking, dashboards), push notifications, wishes job, admin dashboard and reports. |
| **Day 25** | **30 Nov** | **Demo on staging.** Milestone 2 due. |
| Days 26–35 | 1–10 Dec | Fixes from the demo, Capacitor builds, device testing, store listings, load and security checks, restore drill. Milestone 3 due on Day 26. |
| Days 36–38 | 11–12 Dec | Production deploy, store submission, admin training, documentation. Milestone 4 due. |
| After | Dec → | Data entry, zone-by-zone review. |

Twenty-one modules in 18 working days is tight. If something has to slip past the demo, slip the parts of the ad analytics dashboards and reports; they can be finished in the testing window.

---

## 11. Risks to act on now

1. **SMS DLT registration (India).** OTP SMS will not deliver until the Sabha (or you) has a registered entity, sender ID and OTP template on a DLT portal. This can take several days. Start this week. Until then, login on staging works through the dev OTP bypass.
2. **Organisation developer accounts need a D-U-N-S number.** Google Play and Apple organisation accounts both require one, and getting a D-U-N-S number can take one to two weeks or more. The tracker's Day 30 is too late; ask the Sabha to start now.
3. **Prototype approval is overdue** (Day 4 was 9 Nov) and the "Before Day 1" items (Gmail, admin team) are still pending. Under the timeline clause, delays caused by the Sabha move the dates, so record this in the tracker.
4. **Domain and VPS ownership.** The Scope of Work says both are registered in the Sabha's name. Check which accounts they were bought under, and plan the transfer if needed.
5. **A Mac for the iOS build** (section 8).

---

## 12. Open questions for the Sabha

- Existing membership number format, and whether old receipt serials continue or a new series starts.
- Default privacy: hide mobile and address by default? (Recommended: yes.)
- Do business profiles need admin approval? (A toggle in `settings`.)
- Subscription year: financial year (April–March) or rolling from the payment date?
- List of zones.
- Can advertisers be non-members? (The design assumes yes.)
- Is Hindi also needed for content (event text and so on), or only for the interface? (Assumed: interface only.)
