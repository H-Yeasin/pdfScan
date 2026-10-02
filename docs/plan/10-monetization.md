# §10 Monetization: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement M1 from docs/plan/10-monetization.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §4 S4 (cover templates), §6 L4 (i18n), §9 O5's deferred start-up (for the
  entitlement refresh). Pro launches only when the rules in M6 are met.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.

## Context
The core app is free forever: scanning, all filters, OCR, Submit, courses, search, study tools
(annotations, bookmarks, exam packs), backups to a file or folder, and every language. No
watermark, no ads. **Pro** pays for the things that cost real work to build and that power users
want, without making the free app worse.

**Decisions made by the owner (2026-10-02):**
- **Pricing:** a **one-time lifetime unlock** plus a **cheap yearly plan**, with student-level
  regional prices (the Pro screen's placeholder is ৳ 890 for the lifetime unlock in Bangladesh).
- **Scope:** study tools stay free. **Pro = Google Drive backup (§8 B6), app lock, real PDF
  passwords (§7 R6), extra cover templates and theme accents.** OCR language packs, including
  Bangla, stay free (they matter most for the home market).
- Rule: **never take away a feature that was free.**

### What the code looks like today (checked while planning, 2026-10-02)
- `src/config/features.ts`: `FEATURES.pro = false`. `AppNavigator` maps the `'pro'` screen to
  `LibraryScreen` while Pro is off, so nothing reaches it.
- `ProScreen` (hidden): a kicker, a **hard-coded price `৳ 890`**, a subtitle, `FeatureList`
  (`pro.features.*` keys in `en.ts`, from the earlier Pro idea, including features that are now
  free), a "free stays free" card, and "Unlock Pro" / "Restore" buttons that only show an
  "unavailable" alert.
- No billing library, no entitlement state, no biometric library.
- Pro features: §8 B6 (Drive backup) and §7 R6 (PDF passwords) are planned as "later, with
  Pro"; app lock, extra templates and accents don't exist yet. `pdf/coverTemplates.ts` has 3
  templates (Simple, Assignment, Lab report); themes have one accent per mode.
- Packages available for SDK 57: `expo-iap@5.8.2` (an Expo module over Google Play Billing and
  StoreKit, no third-party server), `expo-local-authentication@57.0.3`,
  `expo-secure-store@57.0.4`.

### Key design decisions
- **No server and no billing middleman.** `expo-iap` talks to Google Play Billing directly; the
  entitlement is decided on the phone from the store's own purchase records and cached. Client-
  side checks can be bypassed by determined pirates; for a student app at this price, that risk
  is accepted rather than adding a server (which would break "no account, nothing leaves the
  phone"). Revisit if piracy becomes visible.
- **One registry of Pro features**, used by the Pro screen, the locks in the UI, and a test
  that guards the free list. A feature is sold only once it actually works.
- **Upsell only where a Pro feature is touched** (its Settings row, a locked template), never
  as a popup, never during scanning, saving or submitting.

---

## Steps

### M1 · Entitlements and the Pro feature registry *(S)*
Status: todo

- `src/services/pro/proFeatures.ts`: `PRO_FEATURES: { id, labelKey, status: 'live' | 'planned' }[]`
  for `driveBackup`, `appLock`, `pdfPasswords`, `coverTemplates`, `themeAccents`.
  `FREE_FOREVER`: the list of free features (scan, filters, OCR in every language, submit,
  courses, search, annotations, bookmarks, exam packs, backup to file or folder, …).
  A test fails if an id is in both, so a free feature can't quietly become Pro.
- `src/services/pro/entitlement.ts`:
  - `Entitlement = { tier: 'free' | 'pro'; source?: 'lifetime' | 'yearly'; expiresAt?: number; checkedAt: number }`;
  - `isProActive(entitlement, now)` (pure): lifetime is always active; yearly is active until
    `expiresAt` plus a 7-day offline grace period;
  - cached in `expo-secure-store` (add `expo-secure-store@~57.0.4`), loaded at start-up.
- Store: an `entitlement` slice; `useIsPro()` and `useProFeature(id) → { available, locked }`.
- `components/pro/ProBadge.tsx` (small "Pro" pill) and `ProGate` (renders children, or a locked
  row that opens the Pro screen).
- `ProScreen` and `FeatureList` read `PRO_FEATURES` (only `live` ones are listed as included;
  `planned` ones say "coming"). Remove the stale `pro.features.*` keys from `en.ts`.
- Tests: `isProActive` (lifetime, yearly active, expired, grace period); the free/Pro
  overlap test; `ProGate` locked vs unlocked.

**Done when:** code can ask "is this Pro feature available?" in one call, and nothing that is
free today can be gated without breaking a test.

### M2 · Google Play Billing with `expo-iap` *(M)*
Status: todo

- Add `expo-iap` (check its config plugin and its Expo 57 compatibility in the package source;
  see AGENTS.md). Android first; iOS StoreKit comes with iOS parity (phase P3).
- **Products** (created in Play Console; ids in `src/services/pro/products.ts`):
  - `pro_lifetime`: one-time, non-consumable;
  - `pro_yearly`: a subscription with one yearly base plan (no free trial at launch).
  - Prices are set per country in Play Console; the app shows the store's localised price
    strings (`৳ …`, `₹ …`), never a hard-coded price.
- `src/services/pro/billing.ts`:
  - `loadProducts()`, `buyLifetime()`, `buyYearly()`, `restorePurchases()`;
  - `refreshEntitlement()`: reads the owned purchases and the subscription state, updates the
    cached entitlement; runs after the first frame (O5's deferred start-up) and when the app
    returns to the foreground, at most every 6 hours;
  - **acknowledge** every purchase (Google refunds unacknowledged purchases after 3 days),
    including ones found by `refreshEntitlement` after a crash;
  - **pending purchases** (cash or carrier payments, common in Bangladesh and India): show
    "Payment pending. Pro unlocks when it's confirmed"; unlock on the next refresh;
  - cancelled, refunded or expired subscriptions turn Pro off after the grace period; Pro data
    (for example templates used in old PDFs) is never deleted.
- Error copy for every billing error (`errors.billing.*` in `en.ts`), with "Try again".
- Docs: `docs/qa/billing.md`: Play Console set-up (products, regional prices, license testers,
  internal testing track) and a test checklist (buy, cancel, restore on a second phone,
  refund, pending payment, offline start).
- Tests (with an `expo-iap` mock in `src/test/mocks`): purchase → acknowledged → Pro;
  restore; pending; refund turns Pro off after grace; refresh throttling.

**Done when:** on the internal testing track, a license tester can buy lifetime and yearly,
restore on a second phone, and see Pro turn off after a refund.

### M3 · App lock *(S, Pro)*
Status: todo

- Add `expo-local-authentication@~57.0.3` (check its config plugin for the iOS Face ID
  permission text).
- Settings → Privacy: "Lock PDF Scan" (Pro) with "Lock after: immediately / 1 minute / 5
  minutes in the background". Uses biometrics with the phone's PIN or pattern as fallback; the
  app never stores its own PIN.
- `LockScreen` overlay shown on start and when returning after the chosen time; the app's
  content isn't rendered underneath until unlocked. Option "Hide content in recent apps"
  (Android `FLAG_SECURE` through `expo-screen-capture`, which also blocks screenshots; say so).
- Share intents ("Open with" a PDF) still ask for the unlock first.
- If Pro lapses, the lock keeps working until the user turns it off (taking away a lock would
  expose data); only turning it **on** needs Pro.
- Tests: lock timing; lapse behaviour; the lock covers incoming share intents.

**Done when:** with the lock on, the app's documents can't be seen without the phone's
biometrics or PIN, including from the recent-apps view.

### M4 · Extra cover templates and theme accents *(S, Pro)*
Status: todo

- `coverTemplates.ts`: add 3 Pro templates marked `pro: true`:
  - **Formal** (a double rule, centred, room for supervisor and department);
  - **University** (an institution logo from a photo in the profile, top centre);
  - **Minimal** (large title, small details at the bottom).
  Free users see them in the picker with a `ProBadge` and a preview; choosing one opens the
  Pro screen.
- Theme accents: 4 extra accent palettes in `theme/tokens.ts` (each passing the §9 contrast
  test in light and dark), chosen in Settings → Appearance (Pro).
- Documents already made with a Pro template keep it if Pro lapses; only new uses need Pro.
- Tests: the new templates through `layoutCover` (no overlap, wrapping); accents pass the
  contrast test; the lapse rule.

**Done when:** a Pro user can pick the new templates and accents, and a free user sees them
clearly marked without being blocked from anything else.

### M5 · Pro screen and gentle entry points *(S)*
Status: todo

- `ProScreen` rebuilt:
  - what's included (from `PRO_FEATURES`, `live` only) and what stays free (a short list from
    `FREE_FOREVER`: "Scanning, OCR, Submit, courses, study tools and backups stay free");
  - two options with store prices: **Lifetime** (highlighted) and **Yearly**, with "cancel
    anytime" and the renewal date for yearly;
  - "Restore purchases", and links to the privacy policy and terms (§11 hosts them);
  - after purchase: "Thanks! Pro is on." and a list of what to try.
- Entry points, only these: Settings "PDF Scan Pro" row; the Drive backup row (B6); the App
  lock row (M3); the PDF password option (R6); locked templates and accents (M4). No popups,
  no counters, no reminders.
- Tests: the screen lists only `live` features; entry points open the screen; nothing opens it
  during a scan, save or submit.

**Done when:** the Pro screen shows real prices for both options, and the only ways to reach it
are the rows listed above.

### M6 · Launch rules for Pro *(S, a checklist)*
Status: todo

Turn `FEATURES.pro` on only when all of these are true:
- M1–M5 are done and the M2 test checklist passed on the internal track;
- **at least one substantial Pro feature is live** besides app lock and templates: Drive
  backup (§8 B6) or PDF passwords (§7 R6). Recommended: launch Pro together with B6;
- the privacy policy says purchases are handled by Google Play and that the app has no
  server or account (§11);
- the store listing describes Pro honestly and lists what stays free.

Record the date and the version in this step when Pro is turned on.

---

## Order and dependencies
M1, then M2, then M3 and M4 (in either order), then M5, then M6 when §8 B6 or §7 R6 is ready.

## Critical files
- `src/services/pro/{proFeatures,entitlement,billing,products}.ts` (new), `src/config/features.ts`
- `src/store/slices/entitlementSlice.ts` (new), `src/components/pro/{ProBadge,ProGate,FeatureList}.tsx`
- `src/screens/{ProScreen,SettingsScreen}.tsx`, `src/screens/LockScreen.tsx` (new),
  `src/bootstrap/AppNavigator.tsx`
- `src/services/pdf/coverTemplates.ts`, `src/theme/tokens.ts`, `src/i18n/en.ts`
- `app.json`, `package.json` (`expo-iap`, `expo-secure-store`, `expo-local-authentication`,
  maybe `expo-screen-capture`), `src/test/mocks/`
- `docs/qa/billing.md` (new)

## Verification (for the whole of §10)
1. `npm run typecheck && npm test` pass in CI, including the free/Pro overlap test.
2. Internal testing track on Android with a license tester:
   - prices show in the local currency; buy lifetime; Pro features unlock;
   - a second account buys yearly; cancel; Pro stays until the period ends plus grace;
   - restore on a fresh install; refund turns Pro off; Pro data isn't deleted;
   - a pending payment unlocks after it's confirmed;
   - app lock blocks access, including from recent apps;
   - nothing in the free app is gated, and no Pro prompt appears while scanning or submitting.
