# §10 Monetization: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement M1 from docs/plan/10-monetization.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §4 S4 (cover templates), §6 L4 (i18n), §9 O5 (deferred start-up). All new
  UI text goes through `src/i18n/en.ts`.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.

## Context
**Revised 2026-10-02.** The first version of this plan sold Pro through Google Play Billing
(`expo-iap`). The owner is in Bangladesh, which isn't a supported Google Play merchant
country, so a developer there can't receive Play payouts (re-check in Play Console if this
changes). None of the old steps had started; this version replaces them.

**Play policy note (important for every step):** Google Play's Payments policy forbids
directing users of a Play app to pay outside Google Play for in-app features. So the app must
**never** say "contact us on WhatsApp / bKash to get Pro". The WhatsApp number
(01645724080) is used **only as a support and feedback contact** (M7).

**Decisions made by the owner (2026-10-02):**
1. **Pro access now = rewarded ads.** Watching one ad gives a **Pro day pass**: 24 hours of
   every Pro feature, and no banners. The code for real sales is parked (M9–M11) and turned on
   by a Remote Config switch when a merchant route exists.
2. **Ads are light.** One small banner on the Home and Library lists, plus rewarded ads the
   student chooses to watch. **Never** in Capture, Review, Deliver/Submit, Reader or while
   anything is processing, and no full-screen interstitials.
3. **Backend: Firebase, free Spark plan, no login yet.** Remote Config (ads on/off, reward
   length, support contact, feature flags, without an app update) and opt-in usage counts.
   Firebase Auth comes only with real sales (M10). Supabase was considered; its free projects
   pause after a week without activity, and it would sit beside AdMob anyway.
4. **Free forever:** scanning, all filters, OCR in every language (including Bangla), Submit,
   courses, search, study tools (annotations, bookmarks, exam packs), backups to a file or
   folder. **Pro:** extra cover templates and theme accents, app lock, no banners; later PDF
   passwords (§7 R6) and Google Drive backup (§8 B6). Never take away a feature that was free.

### What the code looks like today (checked while planning, 2026-10-02)
- `src/config/features.ts`: `FEATURES.pro = false`; `AppNavigator` maps `'pro'` to the Library
  while Pro is off.
- `ProScreen` (hidden): a hard-coded `৳ 890`, a feature list from the old Pro idea
  (`pro.features.*` in `en.ts`), and "Unlock Pro" / "Restore" buttons that only show an alert.
- No ads SDK, no Firebase, no entitlement state, no biometrics. Opt-in crash reporting (Sentry,
  F8) exists in `services/telemetry/crash.ts`; reuse its consent pattern.
- Packages checked for SDK 57 / RN 0.86: `react-native-google-mobile-ads@17.2.0` (peer
  `react-native >= 0.86`), `@react-native-firebase/{app,remote-config,analytics}@26.4.0`,
  `expo-local-authentication@57.0.3`, `expo-secure-store@57.0.4`.

## Steps

### M1 · Policy and privacy groundwork *(S, a checklist plus small code)*
Status: done in code (commit 076c8c7); the Play Console checklist is open (owner,
`docs/policy/play-console.md`), and the privacy policy needs hosting (§11).

- Play Console: target audience **13+** (not "Designed for Families"), "Contains ads: yes",
  and Data safety updated (advertising ID and ad interactions through AdMob; opt-in diagnostics
  through Sentry and Firebase; documents never collected).
- Privacy policy text (hosted with §11): what ads and Firebase receive, that documents and OCR
  text never leave the phone, how to turn off ad personalisation.
- In-app wording through `src/i18n/en.ts`: Settings → Privacy explains ads in two lines.
  README and store copy drop "no ads" and use "no ads while you work".
- Settings → Privacy toggles: "Personalised ads" (on by default only where the consent form
  allows it; see M5), "Help improve PDF Scan" (usage counts, off by default, next to the
  existing crash-report toggle from F8).
- Done when: the checklist is ticked and the in-app texts exist.
- **As built:** `settings.personalizedAdsEnabled` (default true; a missing stored value reads as
  true) and `settings.usageStatsEnabled` (default false), actions `settings/SET_PERSONALIZED_ADS`
  / `SET_USAGE_STATS`, persisted in `app:settings`. Nothing reads them yet: M5 maps the first to
  `requestNonPersonalizedAdsOnly`, M8 the second to analytics collection. Settings → Privacy
  shows `settings.privacy.adsNote` above the toggles. The privacy policy draft and the Play
  Console checklist (with the Data safety table) are in `docs/policy/`. There was no store copy
  yet; README's intro and "Privacy by design" now say "no ads while you work". Onboarding still
  shows only the crash-report toggle.

### M2 · Firebase Remote Config (no login) *(S)*
Status: done in code (commit a034bb4); the Firebase project, the EAS file variables and the
console check are open (owner, `docs/firebase.md`).

- Add `@react-native-firebase/app` and `@react-native-firebase/remote-config` (v26.x; check the
  Expo config plugin and SDK 57 support in the package source, see AGENTS.md).
  `google-services.json` / `GoogleService-Info.plist` come from EAS file environment
  variables, **not committed** (the repo is public).
- `src/services/remote/remoteConfig.ts`: typed keys with bundled defaults, fetched after the
  first frame (§9 O5's deferred start-up), cached, and working offline:
  `ads_enabled` (false by default), `ads_banner_screens` (`["home","library"]`),
  `pass_hours` (24), `pass_max_per_day` (3), `support_whatsapp` ("8801645724080"),
  `support_email`, `pro_sales_enabled` (false), `min_supported_version` (message only).
- Tests: defaults when offline; type coercion; unknown keys ignored.
- Done when: changing `ads_enabled` in the Firebase console turns ads on or off on a phone
  after the next start, with no update.
- **As built:** `getRemoteConfig()` / `useRemoteConfig()` (module state with
  `useSyncExternalStore`, not a store slice; Firebase caches on disk). `loadRemoteConfig()` runs
  in `AppNavigator` once `afterBoot`: `ensureInitialized` + the cached values first, then
  `fetchAndActivate` (1 h minimum interval, 0 in dev) and those are applied in the same session.
  It returns early when `getApps()` is empty (no config files) and the SDK is `require`d lazily.
  Ranges: `pass_hours` 1–168, `pass_max_per_day` 0–10; `support_whatsapp` must be 8–15 digits
  (never empty); `ads_banner_screens` is a JSON array. `isVersionBelow()` is ready for the
  `min_supported_version` message, which has no UI yet. `app.config.js` adds the
  `@react-native-firebase/app` plugin only when `GOOGLE_SERVICES_JSON` /
  `GOOGLE_SERVICE_INFO_PLIST` are set. `remote-config` has `analytics` as a peer, so npm
  installed `@react-native-firebase/analytics@26.4.0` too (in the lockfile, not
  `package.json`); `firebase.json` switches off its automatic collection, advertising ID, SSAID
  and screen reporting until M8. New dev build needed.

### M3 · Pro feature registry and entitlements *(S)* (the old M1, adapted)
Status: done (commit 6c75dfa); needs a new dev build for `expo-secure-store`.

- `src/services/pro/proFeatures.ts`: `PRO_FEATURES` (`coverTemplates`, `themeAccents`,
  `appLock`, `noBanners`, later `pdfPasswords` §7 R6 and `driveBackup` §8 B6, each
  `live | planned`) and `FREE_FOREVER`, with a test that fails if a free feature becomes Pro.
- `src/services/pro/entitlement.ts`: `Entitlement = { tier, source: 'pass' | 'lifetime' | 'yearly', expiresAt?, checkedAt }`;
  `isProActive(entitlement, now)` (pure); stored in `expo-secure-store`. `useIsPro()`,
  `useProFeature(id)`, `ProBadge`, `ProGate`.
- **Lapse rules** when a pass ends: app lock keeps working until turned off (removing a lock
  would expose data; only turning it **on** needs Pro); documents made with a Pro template keep
  it; Drive auto-backup (later) pauses with a notice; banners come back.
- Tests: pass active and expired; lapse rules; the free/Pro overlap test.
- **As built:** every Pro feature is `planned` until M4/M5 (and R6, B6) build it, so the Pro
  list is empty for now. Lapse rules are data (`LapseRule`: `keepUntilOff` app lock,
  `keepExisting` covers and PDF passwords, `pause` Drive, `stop` accents and banners) read only by
  `canUseProFeature(id, 'start' | 'keep', isPro)`; when a pass ends, accents go back to the default.
  `FREE_FOREVER` also lists what was already free (reader, PDF tools, sign, share, deadlines,
  restore, no watermark); its test holds a baseline that may only grow. A pass is active only
  between `checkedAt` and `expiresAt` (setting the clock back ends it); `grantPass` adds to a
  running pass and never replaces a paid licence; M6 applies the daily cap. The entitlement is
  module state (`useEntitlement`, `useSyncExternalStore`) loaded at start without deferring;
  until it loads the app counts as free. Secure-store key `pro.entitlement`; `SecureStore.xml` is
  excluded from Android backup (its key can't leave the phone). `FeatureList` now lists
  `liveProFeatures()`; the old `pro.features.*` keys were replaced. A `__DEV__` Settings row
  grants or ends a 24-hour pass.

### M4 · Pro features worth a pass: cover templates, accents, app lock *(M)* (the old M3 + M4)
Status: done in code (commit 1b97805); needs a new dev build and the device checks.

- 3 Pro cover templates (Formal, University with an institution logo, Minimal) in
  `pdf/coverTemplates.ts`; 4 accent palettes in `theme/tokens.ts` passing the §9 contrast test.
- App lock with `expo-local-authentication@~57.0.3` (biometrics with the phone PIN as
  fallback; "lock after" setting; optional hide in recent apps through `expo-screen-capture`);
  "Open with" intents also need the unlock.
- Free users see them marked with `ProBadge`; choosing one offers the day pass (M6).
- Tests as in the old M3/M4.
- **As built:** Status: done in code (commit 1b97805); needs a new dev build
  (`expo-local-authentication`, `expo-screen-capture`) and the device checks below.
  - Covers: `formal` (institution + department over a double rule, supervisor row),
    `university` (logo top centre), `minimal` (large left-aligned title, details on the bottom
    margin), each `pro: true` with a `freeFallback` (Assignment, Assignment, Simple).
    `coverTemplateFor` / `allowedCover` apply the fallback when Pro has ended: Deliver
    (`useResolvedAcademicConfig`) and Submit (`proCovers`) draw the free template; rebuilding a
    lost submission file (`history.ensureSubmissionFile`) keeps the Pro one, and covers already
    in documents are page images, so they never change. New cover item `image` (fitted, skipped
    if unreadable) in `pdfService`, `academicRasterService` and `CoverThumbnail`.
  - Logo: `services/submit/institutionLogo.ts`, a 600 px PNG in `documents/profile/`,
    `settings.institutionLogo` = its file name (not a path). Adding one is free (Settings →
    Profile); it isn't in backup zips.
  - Accents: `ACCENTS` / `themeTokens` in `theme/tokens.ts` (teal + ocean, plum, rose, amber; only
    the four accent tokens change). The choice lives in `ThemeProvider` (`accentPref`, persisted
    in `app:settings` like `themePref`); `accent` falls back to teal without Pro. Settings →
    Appearance `AccentPicker`.
  - App lock: rules in `services/security/appLock.ts` (pure), applied by `store/useAppLock.ts`;
    `components/security/AppLockGate.tsx` wraps AppNavigator's screens and hosts, so nothing
    (an "Open with" file included) renders until unlocked; Back exits while locked. Settings in
    `settings.appLock` (`enabled`, `after` 'immediately' | '1min' (default) | '5min',
    `hideInRecents`, Android only: FLAG_SECURE, which also blocks screenshots). Turning on needs
    Pro, a screen lock on the phone and a successful unlock; turning off needs the unlock too.
    A phone with no screen lock any more opens rather than locking the student out. The
    unlock's own trip to the background (Android's PIN screen) doesn't count. Leaving for the
    document scanner or a picker does count, so "Right away" asks after each scan (said in the
    hint).
  - `useOfferPro` (components/pro): picking a Pro feature without Pro shows an alert that it is
    part of Pro and that a free way to try it is coming; M6 swaps it for the pass offer.
    `SettingRow` takes `proBadge`.
  - Device checks open: unlock with fingerprint and with PIN; lock timing; "Open with" while
    locked; recent apps card blank with "Hide in recent apps"; University logo in the PDF.

### M5 · Banner ads, light and safe *(M)*
Status: done in code (commit 81046d6); open: the owner's AdMob setup (`docs/ads.md`), a new dev
build, the device checks and the before/after numbers in `docs/qa/performance.md`.

- Add `react-native-google-mobile-ads@17.x` (peer `react-native >= 0.86`, matches; check its Expo
  plugin for `androidAppId`/`iosAppId`). AdMob app ids in `app.json`; ad unit ids from Remote
  Config or EAS env; **Google test ids in dev builds**.
- Consent: the SDK's UMP (`AdsConsent`) form where the law requires it (EEA, UK); elsewhere,
  the M1 "Personalised ads" toggle sets `requestNonPersonalizedAdsOnly`.
- `src/services/ads/adPolicy.ts` (pure, fully tested): show a banner only when
  `ads_enabled`, the screen is in `ads_banner_screens`, onboarding is done, it's at least the
  3rd app session, no Pro pass is active, the device is online, and nothing is processing.
- `components/ads/BannerSlot.tsx`: one adaptive banner above the tab bar on Home and Library;
  reserves no space and shows nothing on failure; never inside lists of documents.
- Initialise the SDK after the first frame (O5); measure cold start and APK size before and
  after and record them in `docs/qa/performance.md` (budget: cold start still under 2 s).
- Tests: every `adPolicy` rule; `BannerSlot` renders nothing when the policy says no.
- Done when: with `ads_enabled` on, a banner shows only on Home and Library, never on a
  capture-to-submit path, and cold start stays within budget.
- **As built:**
  - `react-native-google-mobile-ads@~17.2.0`; its plugin in `app.json` with Google's **sample**
    app ids (test ads only) and `delayAppMeasurementInit`; `app.config.js` swaps in
    `ADMOB_ANDROID_APP_ID` / `ADMOB_IOS_APP_ID` from the EAS environment. Banner units are new
    Remote Config keys `ads_banner_unit_android` / `ads_banner_unit_ios` (default empty = no
    banner in release); dev builds always use `TestIds.ADAPTIVE_BANNER`.
  - `adPolicy.bannerBlock` returns the first rule that says no (`adsOff`, `screen`,
    `onboarding`, `newUser` (< `MIN_SESSIONS_FOR_ADS` = 3), `pro` (via `canUseProFeature
    ('noBanners', 'keep')`, now `live`), `offline` (unknown counts as offline), `processing`
    (`capture.processingStatus` not idle), `sdk`, `noUnit`). Remote Config can narrow the
    screens but only Home and Library render a `BannerSlot`.
  - `adsSdk.startAds()` (module state, SDK required lazily): `AdsConsent.gatherConsent()`, then
    `setRequestConfiguration({ maxAdContentRating: T })` and `initialize()` only when
    `canRequestAds`; once per run, any failure leaves ads off. AppNavigator calls it after boot
    only when a banner could show (ads on, onboarding done, third start, no Pro), so the
    consent form never meets a brand-new student and phones with ads off never load the SDK.
  - Personalisation: `nonPersonalizedOnly(gdprApplies, personalizedAdsEnabled)`: where UMP
    applies, its answer (TCF) decides; elsewhere the M1 toggle sets
    `requestNonPersonalizedAdsOnly`.
  - `settings.appSessions` (+1 per cold start, `settings/COUNT_SESSION`); online from
    `expo-network`'s `useNetworkState` (new native module).
  - `BannerSlot` mounts the ad in a zero-height view until `onAdLoaded`, and renders nothing
    after `onAdFailedToLoad`. In the Library it sits above the tab bar (not shown in selection
    mode).
  - Not done here: the cold start and APK size measurements (table in `docs/qa/performance.md`)
    and the device checks in `docs/ads.md`.

### M6 · Rewarded "Pro day pass" and the new Pro screen *(M)*
Status: todo

- `ProScreen` rebuilt: what Pro includes (`live` features only), what stays free, and one
  button "**Watch an ad, get Pro for 24 hours**". When `pro_sales_enabled` is false (now), no
  prices and no purchase buttons are shown at all.
- Rewarded ad through `react-native-google-mobile-ads` (`RewardedAd`); on the reward event,
  grant `{ source: 'pass', expiresAt: now + pass_hours }`, up to `pass_max_per_day`. The reward
  is checked on the phone only (server-side verification would need a paid Firebase plan);
  accepted risk.
- Entry points only where a Pro feature is touched (a locked template, App lock row, accent
  picker) and Settings "PDF Scan Pro". Never a popup, never during scan, save or submit.
  A small "Pro until 18:40" chip in Settings while a pass is active.
- Tests: reward grants a pass; the daily cap; no reward if the ad is closed early; entry points.
- Done when: a student can unlock all Pro features for 24 hours by watching one ad, and the
  pass expires cleanly by the lapse rules.

### M7 · Help & feedback contact *(S)*
Status: todo

- Settings → **Help & feedback**: "WhatsApp: 01645724080" (opens
  `https://wa.me/8801645724080` with a prefilled message containing the app version and
  phone model, **no personal data**), and email, both from Remote Config (M2).
- Wording is support-only ("Questions, problems or ideas? Message us"). No text anywhere says
  the contact sells or unlocks Pro (Play policy).
- Tests: the link builder; Remote Config values used.

### M8 · Opt-in usage counts *(S)*
Status: todo

- `@react-native-firebase/analytics` with collection **disabled by default**
  (`setAnalyticsCollectionEnabled(false)`); turned on only by the M1 "Help improve" toggle.
- A fixed allow-list of events for the `docs/PLAN.md` metrics: `app_open`, `scan_completed`
  (page count only), `document_saved`, `document_submitted`, `pass_started`, `backup_made`. No
  names, course names, file names or text, ever. A test checks every logged event against the
  allow-list.
- Done when: with the toggle off, no Firebase Analytics traffic (checked with a proxy); with it
  on, the events appear in DebugView.

## Later (parked until a merchant route exists)
Status: later

- **M9 · Real Pro sales** (the old M2 billing plan with `expo-iap`, lifetime + yearly) once the
  owner can receive Play payouts (for example through a company or partner in a supported
  country, or if Play adds Bangladesh). Turned on by `pro_sales_enabled`.
- **M10 · Firebase Auth** (Google sign-in) only then, to restore purchases and licences across
  phones; also useful for §8 B6 Drive backup.
- **M11 · Launch rules for paid Pro** (the old M6): only with Drive backup or PDF passwords
  live, and an honest store listing.

## Order and dependencies
M1 → M2 → M3 → M4 → M5 → M6 → M7 (can be done any time; small) → M8. M9–M11 later.

## Critical files (for the implementing sessions)
- `src/services/remote/remoteConfig.ts`, `src/services/pro/{proFeatures,entitlement}.ts`,
  `src/services/ads/adPolicy.ts` (new); `src/components/ads/BannerSlot.tsx`,
  `src/components/pro/{ProBadge,ProGate,FeatureList}.tsx`
- `src/screens/{ProScreen,SettingsScreen,HomeScreen,LibraryScreen}.tsx`, `src/bootstrap/AppNavigator.tsx`
- `src/services/pdf/coverTemplates.ts`, `src/theme/tokens.ts`, `src/i18n/en.ts`,
  `src/config/features.ts`, `src/services/telemetry/crash.ts` (consent pattern to reuse)
- `app.json`, `package.json`, `eas.json` (Firebase files as EAS env), `src/test/mocks/`

## Verification (for the revised §10)
1. `npm run typecheck && npm test` pass (adPolicy, entitlement, overlap, analytics allow-list).
2. Dev build on Android with test ad ids: banner only on Home and Library after onboarding and
   from the 3rd session; none in capture → submit; rewarded ad grants a 24-hour pass that
   unlocks templates, accents and app lock and hides banners; pass expiry follows the lapse
   rules; `ads_enabled = false` in Remote Config removes all ads after a restart.
3. Help & feedback opens WhatsApp with the prefilled message.
4. With "Help improve" off, no analytics traffic.
