# §11 Launch and growth: step-by-step plan

## How to use this file
- One step per session, as with the other plan files. Read `AGENTS.md`, `docs/plan/README.md` and
  only the step you're working on.
- When a step is done, update its `Status:` line, add "As built" notes, and update
  `docs/plan/README.md` and `docs/PLAN.md` §11.
- The step prefix is **L** (launch). Most of L2–L5 is the owner's work in consoles and on phones.
  This file puts it in order and links to the checklists that already exist, rather than copying
  them:
  - [`docs/build.md`](../build.md) §9: the AAB, signing and version codes.
  - [`docs/ads.md`](../ads.md#release-checklist): the AdMob release checklist.
  - [`docs/firebase.md`](../firebase.md): the Firebase project and Remote Config.
  - [`docs/crash-reporting.md`](../crash-reporting.md): Sentry.
  - [`docs/policy/play-console.md`](../policy/play-console.md): Play Console forms and Data safety.
  - [`docs/policy/privacy-policy.md`](../policy/privacy-policy.md): the text to host.
  - [`docs/store/listing.md`](../store/listing.md): listing text, graphics and screenshots.

## Context
**Planned 2026-10-30.** §0–§19 are done in code, and nothing has shipped yet. The owner wants the
first Google Play release. The order is L1 → L2 → L3 (L3 can run alongside L2) → L4 → L5. L6 and
later wait for retention numbers.

**What a new Play account needs (check in Play Console, it changes):**
- A personal developer account made after November 2023 must run a **closed test** with at least
  **12 testers opted in for 14 days in a row** before it can apply for production. An organisation
  account doesn't have to. §11's closed beta (20–50 students) covers the rule, as long as at least
  12 of them stay opted in the whole time.
- New apps must target a recent Android API. RN 0.86 / SDK 57 build with `targetSdk` 36, which meets
  the 2026 rule. L2 checks the built AAB.
- The first AAB has to be uploaded by hand. After that, `eas submit` can do it (`docs/build.md` §9).

## L1 · Release config *(S)*
Status: done in code (2026-10-30).

- `app.json` `android.blockedPermissions` adds `SYSTEM_ALERT_WINDOW` (from the Expo template) and
  `READ_MEDIA_IMAGES`. expo-screen-capture brings the second for its screenshot listener, which the
  app doesn't use: `useAppLock` calls only `prevent/allowScreenCaptureAsync`. Play's Photo and
  Video Permissions policy allows it only for apps built around broad photo access. On Android 13+
  expo-image-picker opens the system Photo Picker and asks for nothing.
- `app.json` lists Sentry once (`@sentry/react-native/expo`). The bare entry used to win and drop
  its options (`docs/build.md` §10).
- Guard test `src/__tests__/releaseManifest.test.ts` checks four things: the blocked permissions,
  that nothing is both asked for and blocked, that Sentry is listed once, and that `app.json`
  keeps Google's sample AdMob id (the real one comes only from the EAS environment,
  `app.config.js`).
- `privacy-policy.md`: the Pro pass is 1 hour (it said "a day"), Pro tasks ask for an ad, screens
  are named Files and Me, consent covers Switzerland too, and there's a contact email. It's no
  longer a draft.
- `play-console.md` gains App access, Advertising ID, Content rating, the other declarations,
  permissions and contact details.

## L2 · Production build and checks *(M; owner + session)*
Status: open.

1. **Before anything:** check the tree for the payload that keeps coming back. `api.js` must be
   absent, `package.json`'s `start` must be `expo start`, `jest.config.js` must be about 2.3 KB, and
   no tracked file may have a line over 1,000 characters except the prose in AGENTS.md /
   `docs/PLAN.md` / `docs/plan/README.md`. Then run `npm run typecheck && npm test`.
2. **Owner:** rotate the Sentry DSN (§16 G1). In expo.dev ▸ Environment variables ▸
   **production**, set:
   - `GOOGLE_SERVICES_JSON` (file, secret)
   - `ADMOB_ANDROID_APP_ID` (the real `ca-app-pub-…~…`)
   - `EXPO_PUBLIC_SENTRY_DSN` (the new DSN)
   - `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` (secret)
   See `docs/build.md` §2. The AdMob, Firebase and Sentry setup in their own docs comes first.
3. Raise `app.json` `version` if this isn't the first upload (1.0.0 for the first). EAS raises
   `versionCode` itself.
4. `eas build -p android --profile production`. It's the first build with R8 (§16 G8) and without
   pdf-jsi (§18 W18), and EAS prebuilds from scratch.
5. **Check the AAB** (download it from the EAS build page; `bundletool` is from
   `brew install bundletool`):
   - `bundletool dump manifest --bundle app.aab`:
     - `targetSdkVersion` is 36.
     - Permissions are only CAMERA, INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE, WAKE_LOCK,
       VIBRATE, USE_BIOMETRIC, USE_FINGERPRINT, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED,
       DETECT_SCREEN_CAPTURE, `com.google.android.gms.permission.AD_ID` and the
       `ACCESS_ADSERVICES_*` ones the ads and Firebase SDKs add, the app's own
       `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, and READ/WRITE_EXTERNAL_STORAGE with
       `maxSdkVersion="32"`. Anything else: find which library adds it before uploading.
     - **Not present:** READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, SYSTEM_ALERT_WINDOW, RECORD_AUDIO,
       SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM. If an exact-alarm permission shows up, block it in
       `app.json` and check the deadline reminders still fire, since an inexact alarm can be late by
       minutes. Don't file Play's exact-alarm declaration: a reminder app doesn't qualify.
     - The `com.google.android.gms.ads.APPLICATION_ID` meta-data is the real app id, not
       `3940256099942544`.
   - `keytool -printcert -jarfile app.aab`: the owner is the EAS upload key, not `CN=Android Debug`.
   - Record the AAB size and the download size per device
     (`bundletool build-apks --bundle app.aab --output app.apks` then
     `bundletool get-size total --apks app.apks`) in `docs/qa/performance.md` §16 G8.
6. **Release smoke test** on a 2–3 GB phone, installed from the AAB
   (`npx expo run:android --binary app.aab`) or from the internal track (L4). Register the phone
   as an AdMob test device first, and never tap a real ad.
   - Cold start: the splash intro, the first open, onboarding.
   - Scan 3 pages → Review (crop, filter) → Save with a course → Done → Share.
   - Files: search for a word from the scan, multi-select, merge (keep originals), delete, Undo.
   - "Open with" a PDF from WhatsApp or Files → Find, highlight, sign → Export: the marks are in it.
   - Open a DOCX and an XLSX, then Convert to PDF (a Pro task): a real ad plays. Airplane mode, then
     one more task: the offline grace task runs once, then "The ad couldn't load".
   - Back up everything, then restore on a clean install.
   - With a 3-button nav bar: nothing sits under the bar (§14's "done when").
   - Turn on crash reports (Me → Privacy & security). The EAS build log shows the source-map
     upload. Once the first release event reaches Sentry, check its JS frames show file names and
     lines, not `index.android.bundle:1`.
   - A Kotlin/Java crash or a `ClassNotFoundException` here is R8. Add a keep rule under
     `expo-build-properties` `android.extraProguardRules` in `app.json`, one comment each, and
     rebuild.
7. Keep the build's `mapping.txt` (EAS build artifacts) and upload it in Play Console ▸ App bundle
   explorer ▸ Downloads for that version code.

## L3 · Store listing, policy hosting, assets *(S–M; owner)*
Status: open. The draft text is in [`docs/store/listing.md`](../store/listing.md).

1. **Developer website.** One public site hosts both:
   - The privacy policy: `privacy-policy.md` as a page.
   - `app-ads.txt` at the **root** of the domain: one line from AdMob ▸ Apps ▸ app-ads.txt, of the
     form `google.com, pub-…, DIRECT, f08c47fec0942fa0`.
   GitHub Pages works: a user site `<user>.github.io` from a separate public repo, with
   `index.html`, `privacy.html` and `app-ads.txt`. A project page (`<user>.github.io/<repo>/`)
   **doesn't**, because AdMob only looks at the root. Put the same site in Play Console ▸ Store
   settings ▸ Website.
2. **Play Console ▸ App content:** everything in `docs/policy/play-console.md`.
3. **Main store listing:**
   - The text from `listing.md`.
   - The 512 icon `assets/store/playstore-icon.png`.
   - A 1024×500 feature graphic.
   - 4–8 phone screenshots following `listing.md`'s shot list.
   - Category and contact email.
4. AdMob ▸ Apps ▸ link the app to its Play listing once it's published to any track. Then AdMob
   ▸ app-ads.txt shows "Verified" (it can take a day).

## L4 · Internal testing, then closed testing *(owner)*
Status: open.

1. **Internal testing** (up to 100 testers, no review wait):
   - Create the app in Play Console (default language English (UK), app, free, ads: yes).
   - Testing ▸ Internal testing ▸ create a release ▸ upload L2's AAB ▸ add the owner and a few
     testers by email ▸ roll out.
   - Install from the Play Store link and run L2.6's smoke test again on that install. It's signed
     by Play, the way users will get it.
2. **Set up `eas submit`** for later uploads:
   - Make a Google Cloud service account with a JSON key.
   - In Play Console ▸ Users and permissions, give it Release manager rights for this app.
   - Run `eas credentials -p android` ▸ Google Service Account ▸ upload the key.
   - Then `eas submit -p android --profile production --latest`. Add `"track": "internal"` (later
     `"alpha"` for closed testing) under `submit.production.android` in `eas.json`. That's a config
     file: review it as AGENTS.md says.
3. **Closed testing** (§11's closed beta):
   - Recruit 20–50 students from 2–3 universities. At least **12 must stay opted in for 14 days**.
   - Share the opt-in link, plus a weekly feedback form (a Google Form is fine; it collects no
     document content).
   - Use the round to cover the device checks that are still open: `docs/qa/walkthrough.md`,
     `docs/qa/usability-study.md` (§19 X4) and `docs/qa/performance.md` (§19 X2's runs).
   - Push fixes as new closed-track releases (a new `version` for anything students see).
4. Watch Play Console ▸ Android vitals (ANR rate under 0.47%, crash rate under 1.09%, the
   bad-behaviour thresholds), the pre-launch report (Play's robot run on real devices; check its
   screenshots for anything under the system bars), and Sentry for the testers who opted in.

## L5 · Production *(owner)*
Status: open.

1. After 14 days with at least 12 testers, go to Dashboard ▸ "Apply for production". Play asks
   about the test: who tested, what changed, why it's ready.
2. **Before promoting the build:**
   - Remote Config has `ads_enabled = true`, the units set and `pro_tasks_free = false`
     (`docs/ads.md` release checklist).
   - The consent message is published.
   - `app-ads.txt` shows Verified.
3. **Staged rollout:** 10% → 50% (2–3 days, no vitals regressions) → 100%. Halt the rollout if the
   crash rate jumps. A halted release can be resumed or replaced with a fixed version code.
4. After release, follow `docs/ads.md` step 6 (`pro_task_ad_unavailable` by reason).

## L6+ · Growth *(later; from `docs/PLAN.md` §11)*
Status: not planned. Plan each one when retention data exists:
- A share message with an optional, user-controlled "Made with PDF Scan" link (never a watermark).
- Store listing experiments (Play Console ▸ Store listing experiments) on the short description
  and the first screenshot.
- A campus ambassador or referral programme, once retention is proven.

## Verification
1. L1: `npm run typecheck && npm test` pass, `releaseManifest.test.ts` included.
2. L2: the manifest dump matches L2.5's list, the AdMob id is real, the signature is the upload key,
   and the smoke test passes on a 2–3 GB phone.
3. L3: the privacy URL opens in a private browser window, and AdMob shows app-ads.txt "Verified".
4. L4: an internal-track install from the Play Store passes the smoke test, and the closed test
   reaches 14 days with at least 12 testers.
5. **Done when:** a production release is at 100%. Its Data safety form matches `play-console.md`,
   and vitals stay under Play's thresholds for a week.
