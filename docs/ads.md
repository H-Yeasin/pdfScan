# Ads setup (§10 M5, M6)

For the owner. The code is in place; ads stay off until the steps below are done and
`ads_enabled` is switched on in Remote Config (see `docs/firebase.md`).

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
- Development builds always use Google's test units, so a dev phone never sees (or clicks) a
  real ad.

## Setup

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
6. Switch on `ads_enabled` and publish. The next start on a phone (third start or later) shows
   the banner.

## Checks on a phone (dev build, test ads)

- Banner on Home and Library only, above the tab bar; none in capture → review → deliver/submit
  or the Reader; none while a scan is processing.
- None in the first two starts or before the introduction is done; none offline.
- Settings (dev) "Grant a Pro pass": banners disappear; ending it brings them back.
- `ads_enabled = false` in Remote Config: no banner after the next start, and no ads SDK
  requests in logcat.
- With a VPN in an EEA country: the consent form shows once.
- Pro screen: the test rewarded ad watched to the end gives Pro until now + 1 h (Settings
  shows "Pro until …", banners go, Pro covers, accents and app lock unlock); closing it early
  gives nothing; the fourth pass of a day is refused. When the pass ends: banners come back,
  the accent goes back to teal, an app lock stays on.
- Cold start and APK size before and after: `docs/qa/performance.md`.
