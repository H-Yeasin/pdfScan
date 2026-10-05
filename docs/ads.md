# Ads setup (§10 M5, M6, §14 Q2)

For the owner. The code is in place. Release builds start with `ads_enabled` on (§14 Q1), but
until the steps below are done they can't show a real ad, and since §14 Q1 that means **Pro
tasks can't run** (they need a rewarded ad watched to the end). Do the
[release checklist](#release-checklist) before any build reaches a Play track.

## What the app does

- One adaptive banner above the tab bar on Home and Library. Never in Capture, Review,
  Deliver/Submit or the Reader, never while a scan is being processed, no full-screen ads.
- No banner before the introduction is done, in a student's first two starts, offline, or
  while a Pro pass is active. All the rules: `src/services/ads/adPolicy.ts`.
- The Google Mobile Ads SDK (and its consent form) loads only when a banner could show, after
  the first frame. In the EEA, UK and Switzerland Google's consent form (UMP) asks first;
  elsewhere Settings → Privacy → "Personalised ads" decides.
- The Pro pass (M6; 1 hour since 2026-10-04): on the Pro screen only, the student taps "Watch an
  ad, get Pro for 1 hour"; a rewarded ad watched to the end grants `pass_hours` of Pro, at most `pass_max_per_day`
  times a day. Closing it early gives nothing. Never shown on its own.
- Pro tasks (§12 D1, strict since §14 Q1): converting, editing a file and filling a form cost one
  rewarded ad watched to the end, unless the student has a Pro pass, a live grant (the edit
  session one ad unlocked), or `pro_tasks_free` is on. If no ad can show while the phone is
  online (no fill, timeout, broken SDK, no unit, consent, ads off), the task **doesn't run**: the
  sheet says "The ad couldn't load" with Try again and the Pro pass. Only a phone that is really
  offline gets `offline_free_tasks_per_day` (default 1) tasks a day without an ad.
- Development builds always use Google's test units, so a dev phone never sees (or clicks) a
  real ad.

## Release checklist

Do these in order; each is needed for a release build to serve real ads (§14 Q2).

1. [ ] **Real AdMob app ID (build time).** AdMob ▸ Apps ▸ add the Android app, copy its app ID
   (`ca-app-pub-…~…`, with a `~`), and set it as the EAS environment variable
   `ADMOB_ANDROID_APP_ID` for the production profile ("Setup details" step 3; `ADMOB_IOS_APP_ID` later).
   `app.config.js` puts it into the `react-native-google-mobile-ads` plugin. Without it the build
   keeps `app.json`'s Google **sample** ID (`ca-app-pub-3940256099942544~3347511713`), which can
   never serve a real ad, so every Pro task shows "The ad couldn't load". It's baked in at build
   time: a new build is needed after setting it. (If you ever put the ID in `app.json` instead,
   that's a config-file change: review the diff for long lines and trailing whitespace, see
   AGENTS.md's security note.)
2. [ ] **Ad units and switches (runtime).** AdMob ▸ create one **Rewarded** and one **Banner**
   unit. Firebase ▸ Remote Config: set `ads_rewarded_unit_android`, `ads_banner_unit_android`,
   `ads_enabled = true`, `offline_free_tasks_per_day = 1`, `pro_tasks_free = false`, and
   **publish** the changes.
3. [ ] **`app-ads.txt`** on the developer website listed in Play Console (AdMob requirement;
   "Setup details" step 5).
4. [ ] **Check on a dev build:** Settings ▸ Developer ▸ "Ads setup" should read
   `SDK: ready · Rewarded unit set: yes · Remote Config: fetched` (or `cached`). `Rewarded unit
   set: no` = step 2 isn't published or this phone hasn't fetched it yet (restart);
   `Remote Config: bundled defaults` = no Firebase files in this build or no fetch yet;
   `SDK: unavailable (consent)` = the consent form wasn't accepted (try Ad choices on a Pro
   task's error sheet). Dev builds use test units, so this checks the configuration, not the
   real app ID; for that, install the release build from the internal track and convert a file.
5. [ ] **Watch the telemetry** after release (opt-in counts, `docs/firebase.md`):
   `pro_task_ad_unavailable` by `reason` (1 ads off, 2 no unit, 3 SDK, 4 consent, 5 no fill,
   6 timeout) shows a broken setup; `pro_task_offline_free` counts the offline grace.

## Setup details

1. **AdMob:** create an account, add the app (Android, and iOS later), and create one
   **Banner** and one **Rewarded** ad unit per platform (reward: any amount, e.g. "1 pass").
2. **Consent form:** AdMob ▸ Privacy & messaging ▸ create a GDPR message for the app (Google's
   consent form for the EEA, UK and Switzerland). Without it, `gatherConsent` can't show a form
   there and ads stay off in those regions.
3. **App ids (build time):** add EAS environment variables (plain text, not secret: they end up
   in the app) for the production profile:
   - `ADMOB_ANDROID_APP_ID` = `ca-app-pub-…~…`
   - `ADMOB_IOS_APP_ID` = `ca-app-pub-…~…`

   Without them, `app.json`'s Google sample app ids are used, which only ever serve test ads.
4. **Ad units (runtime):** in Firebase ▸ Remote Config set `ads_banner_unit_android` (and
   `ads_banner_unit_ios`) to the banner units, and `ads_rewarded_unit_android` (and
   `ads_rewarded_unit_ios`) to the rewarded units (`ca-app-pub-…/…`). Empty = no banner / no
   pass in release builds.
5. **`app-ads.txt`:** publish the line AdMob gives you at the root of the developer website
   listed in Play Console (with §11's website).
6. Keep `ads_enabled` on (the console value wins over the release default) and publish. The
   next start on a phone (third start or later) shows the banner. Turning it **off** stops
   banners and the SDK **and** makes Pro tasks unavailable (not free) unless `pro_tasks_free`
   is on too.

## Checks on a phone (dev build, test ads)

- Banner on Home and Library only, above the tab bar; none in capture → review → deliver/submit
  or the Reader; none while a scan is processing.
- None in the first two starts or before the introduction is done; none offline.
- Settings (dev) "Grant a Pro pass": banners disappear; ending it brings them back.
- `ads_enabled = false` in Remote Config: no banner after the next start, and no ads SDK
  requests in logcat; a Pro task shows "The ad couldn't load" and doesn't run.
- `pro_tasks_free = true`: Pro tasks run without the sheet.
- No rewarded unit / no fill while online: the task sheet's error state, Try again asks again;
  in airplane mode one task a day runs with the "Offline: this one's free" snack.
- With a VPN in an EEA country: the consent form shows once.
- Pro screen: the test rewarded ad watched to the end gives Pro until now + 1 h (Settings
  shows "Pro until …", banners go, Pro covers, accents and app lock unlock); closing it early
  gives nothing; the fourth pass of a day is refused. When the pass ends: banners come back,
  the accent goes back to teal, an app lock stays on.
- Cold start and APK size before and after: `docs/qa/performance.md`.
