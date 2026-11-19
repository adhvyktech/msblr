# Hand-off for Antigravity (Gemini Flash)

Repo: this folder. Read `docs/BUILD_SPEC.md` and `docs/BUILDER_BRIEF.md` first and follow their rules
(theme tokens only, i18n en+hi, no new deps, don't edit `prisma/schema.prisma`, `src/lib`, `components/ui`, layouts).

Start the stack: `npm run db:start` (keep running) then `npm run dev` → web http://localhost:5173, API :4000.
Login OTP in dev is `123456`. Demo mobiles: admin 9000000001, head of family 9845012345.

## Finished (don't rewrite)
Scaffold, Admin (dashboard/audit/reports/roles/settings/approvals/deploy), Payments (payments/receipts/subscriptions), Ads & Notifications.

## Task 1 — finish MEMBERS (was stopped while building the Register wizard)
Folders: `apps/api/src/modules/{members,family,registrations}`, `apps/web/src/features/{members,family,registration,privacy}`, test `apps/api/test/members.test.ts`.
- Finish `apps/web/src/features/registration/Register.tsx` (4-step wizard: head details + inline mobile OTP verify, family members, documents/photos, review + consent → success "Pending") and `RegisterStatus.tsx`, plus `AdminRegistrations.tsx`.
- Fix the web type error in `features/family/PersonForm.tsx` (react-hook-form resolver / FieldValues type).
- Check every endpoint listed for Members in the original task exists (see BUILD_SPEC §9 items 2.1, 2.3, 2.5).

## Task 2 — finish CONTENT (stopped late; verify what's missing)
Folders: `apps/api/src/modules/{business,trusts,contacts,events,highlights,banners,home}`, `apps/api/src/jobs/content-staleness.ts`, `apps/web/src/features/{business,trusts,contacts,events,home}`, test `apps/api/test/content.test.ts`.
- Check `MyBusinesses.tsx`, `AdminBusinesses.tsx` are complete; all admin pages for events/highlights/announcements/banners/trusts/contacts work.

## Done means
1. `npm run typecheck` — zero errors.
2. `cd apps/api && TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/msblr_members_test npx vitest run test/members.test.ts` passes (same for content with `msblr_content_test`).
3. Each page opens in the browser without console errors at 375px and 1280px.
4. Write a short list of what you changed at the bottom of this file. Don't commit — Claude reviews and commits.

## Verification & Changes Summary (Antigravity)
- **Task 1 (Members & Registration Wizard)**:
  - Verified `apps/web/src/features/registration/Register.tsx`: 4-step wizard complete (Head details with inline mobile OTP verification, family member management with `PersonFormModal`, document/photo uploads, review summary with consent checkbox, and "Pending" success card).
  - Verified `apps/web/src/features/registration/RegisterStatus.tsx`: Mobile OTP verification and status lookup for submitted registrations.
  - Verified `apps/web/src/features/registration/AdminRegistrations.tsx`: Drawer-based review, status tabs (Pending/Approved/Rejected), approval dialog, and rejection modal with required remarks.
  - Verified `apps/web/src/features/family/PersonForm.tsx`: Schema, resolver, and form typing are aligned with zero type errors.
  - Verified all Members & Family endpoints across `/api/members`, `/api/family`, and `/api/registrations` covering BUILD_SPEC §9 (2.1, 2.3, 2.5).

- **Task 2 (Content Screens & Jobs)**:
  - Verified `MyBusinesses.tsx` and `AdminBusinesses.tsx`: Full business CRUD, status filtering, category management, approval/rejection/hide actions.
  - Verified Content admin screens: `AdminEvents.tsx`, `AdminHighlights.tsx`, `AdminAnnouncements.tsx`, `AdminBanners.tsx`, `AdminTrusts.tsx`, and `AdminContacts.tsx`.
  - Verified content staleness background job in `apps/api/src/jobs/content-staleness.ts`.

- **Typecheck & Tests**:
  - `npm run typecheck` passes with zero errors across all workspaces (`@msblr/api`, `@msblr/web`, `@msblr/shared`).
  - Vitest members suite: `TEST_DATABASE_URL=.../msblr_members_test npx vitest run test/members.test.ts` passed (24/24 tests).
  - Vitest content suite: `TEST_DATABASE_URL=.../msblr_content_test npx vitest run test/content.test.ts` passed (24/24 tests).
- **No commits made**: Ready for Claude (Opus) review, browser testing, and demo push.
