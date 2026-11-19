# Launch checklist — DLT SMS, Google Play, Apple App Store

Start all three **today**. They run in parallel and the waiting time is on the regulator/store side, not ours.
Fees and timelines below are typical figures — confirm on the portal at the time of applying.

## 0. Documents the Sabha should keep ready (used by all three)
- Sabha registration certificate (Society / Trust registration) and **PAN card of the Sabha**
- GST certificate if registered (not mandatory for DLT if registration certificate + PAN are given)
- Authorisation letter on Sabha letterhead naming the person who will handle registrations (signed by President/Secretary)
- That person's PAN / Aadhaar and mobile number
- Official email on the domain (e.g. `admin@msblr.com`) — needed by Google/Apple; set up mail forwarding on the domain if no mailbox exists
- Sabha address proof (same as on registration certificate)

## 1. DLT registration (needed for OTP SMS in India)
Without this, OTP SMS will not be delivered. Until it is done, the app uses the developer OTP on staging only.

| Step | Where | What | Typical time |
|---|---|---|---|
| 1. Principal Entity (PE) registration | Any one DLT portal: Jio TrueConnect, Vodafone Idea Vilpower, Airtel DLT, BSNL, etc. (one portal is enough — it syncs across operators) | Register as "Enterprise" with the documents above; pay the one-time fee (about ₹5,900 incl. GST on most portals) | 1–3 working days for approval |
| 2. Header (Sender ID) | Same portal | 6-letter header, e.g. `MSBLRS` or `MSBLRE` (category: Service/Transactional) | 1–2 days |
| 3. Content template | Same portal | OTP template, category **Service Implicit**. Suggested text: `{#var#} is your MSBLR E-Directory login OTP. Valid for 5 minutes. Do not share it with anyone. - Maheshwari Sabha Bengaluru` | 1–2 days |
| 4. SMS provider | MSG91 (or similar) account in the Sabha's name | Add the DLT Entity ID, Header and Template ID; buy SMS credits | Same day |
| 5. Hand over to Adhvyk | — | Share: provider API key, DLT Entity ID, Header, Template ID | — |

We then switch `ConsoleSmsProvider` to the live provider (one environment variable change + test).

## 2. Google Play Console (Android app)
| Step | What | Typical time |
|---|---|---|
| 1. D-U-N-S number | Apply free at Dun & Bradstreet India (dnb.co.in) using the Sabha's legal name and address exactly as registered. **Same number is reused for Apple.** | Often 1–2 weeks, can be up to ~30 days; paid expedite exists |
| 2. Google account | One main Gmail in the Sabha's name (already requested before kick-off) | Same day |
| 3. Developer account | play.google.com/console → **Organisation** account, D-U-N-S, website `msblr.com`, contact email/phone; pay **US$25 one-time** | 2–7 days verification |
| 4. Invite Adhvyk | Users & permissions → invite our email as Admin (release manager) | Same day |
| 5. Store listing inputs | App name, short/long description (EN + HI), privacy policy URL (we host at msblr.com/privacy), category "Social" or "Lifestyle", content rating questionnaire, data-safety form (we prepare answers) | We prepare |

An organisation account avoids Google's 20-tester / 14-day closed-testing rule that applies to new personal accounts.

## 3. Apple Developer Program (iOS app)
| Step | What | Typical time |
|---|---|---|
| 1. D-U-N-S | Same number as above | — |
| 2. Apple ID | Create with the Sabha email; enable two-factor authentication on a phone the Sabha controls | Same day |
| 3. Enrol as Organisation | developer.apple.com/programs/enroll → legal entity name must match D-U-N-S; **US$99/year**. Eligible non-profits can request a fee waiver (only if the Sabha is a registered non-profit) | 2–7 days after D-U-N-S is visible to Apple |
| 4. Invite Adhvyk | App Store Connect → Users and Access → add our email as Admin/App Manager | Same day |
| 5. Build machine | iOS builds need macOS (a Mac, or a cloud build service such as Codemagic/Appflow) | Decide now |

## 4. If D-U-N-S is delayed (fallback, needs Sabha approval)
Publish the first version under Adhvyk Tech Solution's own developer accounts and **transfer the apps** to the Sabha's accounts once they are approved (both stores support app transfer). This keeps the launch date but adds a transfer step.

## 5. Firebase (push notifications)
In the Sabha's main Gmail: create a Firebase project "MSBLR E-Directory", add Android app `in.msblr.edirectory` and iOS app with the same ID, upload the Apple APNs key (from the Apple account), invite Adhvyk as Editor. We then enable real push (web + Android + iOS).

## 6. Mobile app plan (one week, in parallel with store approvals)
- Day 1–2: Capacitor wrap of the web app (same code), app icons/splash from the orange logo, native push, camera/file upload, share sheet, deep links, loading-screen ad.
- Day 3–4: Android build → internal testing track (as soon as Play account is approved); iOS build → TestFlight (as soon as Apple account is approved).
- Day 5–6: Fixes from Sabha testing; store listings, screenshots (we generate), privacy policy.
- Day 7: Submit for review. Review time is set by Google/Apple (usually 1–3 days).
