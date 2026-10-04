# Firebase (Remote Config, no login)

§10 M2. Firebase's free Spark plan, used for Remote Config (and, from M8, opt-in usage counts).
No sign-in. The app works without Firebase: builds without the config files keep the bundled
defaults in `src/services/remote/remoteConfig.ts` (ads off, sales off).

## One-time setup (manual)

1. In the [Firebase console](https://console.firebase.google.com), create a project and add an
   Android app with package `com.yeasin.pdfscan` (and an iOS app with bundle id
   `com.yeasin.pdfscan` when iOS ships). Leave Google Analytics on for the project; collection in
   the app stays off until the student opts in (M8, and `firebase.json`).
2. Download `google-services.json` (and `GoogleService-Info.plist`). **Don't commit them**; the
   repo is public and `.gitignore` lists both.
3. In EAS (expo.dev ▸ project ▸ Environment variables), add **file** variables, visibility
   "Secret", for every environment that builds the app:
   - `GOOGLE_SERVICES_JSON`: the `google-services.json` file.
   - `GOOGLE_SERVICE_INFO_PLIST`: the `GoogleService-Info.plist` file (iOS).
   `app.config.js` passes their paths to the `@react-native-firebase/app` plugin, and leaves the
   plugin out when neither is set. With only one set, prebuild for the other platform fails.
4. For a local dev build with Firebase: put the file in the project root and run
   `GOOGLE_SERVICES_JSON=./google-services.json npx expo run:android`.

## Remote Config keys

Create these parameters in Firebase ▸ Remote Config (types as in the console). A missing key, a
wrong type or an out-of-range value uses the default.

| Key | Type | Default | Notes |
|---|---|---|---|
| `ads_enabled` | Boolean | `false` | Master switch for every ad (M5, M6). |
| `ads_banner_screens` | JSON | `["home","library"]` | Screens a banner may show on. Only `home` and `library` have a banner slot. |
| `ads_banner_unit_android` | String | (empty) | AdMob banner unit `ca-app-pub-…/…`. Empty = no banner in release builds (dev builds use Google's test unit). |
| `ads_banner_unit_ios` | String | (empty) | The same for iOS. |
| `ads_rewarded_unit_android` | String | (empty) | AdMob rewarded unit for the Pro pass (M6) and Pro tasks (§12 D1). Empty = no pass in release builds. |
| `ads_rewarded_unit_ios` | String | (empty) | The same for iOS. |
| `pass_hours` | Number | `1` | Pro pass length (hours), 1–168. Was `24` until 2026-10-04 (`docs/plan/13-pro-pass-one-hour.md`); if the console still has `24`, change it to `1` and publish, or installed apps keep giving 24 hours. |
| `pass_max_per_day` | Number | `3` | Passes a day, 0–10. |
| `edit_unlock_minutes` | Number | `30` | §12 D1: how long one rewarded ad unlocks editing a document, 5–240. |
| `offline_free_tasks_per_day` | Number | `5` | §12 D1: Pro tasks a day that run without an ad when none can load (offline, no fill), 0–50. Past that the Pro pass is offered. |
| `task_ad_timeout_ms` | Number | `8000` | §12 D1: how long a Pro task waits for its ad before running without one, 2000–30000. |
| `support_whatsapp` | String | `8801645724080` | Digits only, with country code (wa.me). Support only. |
| `support_email` | String | (empty) | Empty = not shown. |
| `pro_sales_enabled` | Boolean | `false` | Paid Pro (M9). Keep false. |
| `min_supported_version` | String | (empty) | e.g. `1.2.0`; older builds see an update message. |

The app reads the values fetched last time a moment after start (they're cached, so this
works offline), then fetches new ones (at most once an hour; every start in dev builds) and
applies them. A console change shows up on the next start.

## Cost: stay on Spark (checked 2026-10-03)

Since 2026-09-01 Remote Config is billed by use, but every project (Spark or Blaze) gets
**100,000 fetch requests a day free**; on Blaze the rest is $0.06 per 10K. Firebase's banner
asking to "upgrade to Blaze by 2026-11-15" only matters for projects that go over that.

- One device makes at most one fetch an hour (`FETCH_INTERVAL_MS`), and in practice about one
  per app start. At ~3 starts a day that is roughly **30,000 daily users** before the limit.
- On Spark, fetches over the limit fail. `loadRemoteConfig` then keeps the values cached from
  the last good fetch (or the bundled defaults), so nothing breaks; console changes just reach
  fewer devices that day.
- If daily users approach that number: first raise `FETCH_INTERVAL_MS` (e.g. 12 h; ads and
  pass settings rarely change), and only then think about Blaze (it needs a billing card).
- Watch usage in the console: Remote Config ▸ Usage, or Google Cloud ▸ APIs ▸
  Firebase Remote Config API ▸ Metrics.

## Analytics: off unless the student opts in (§10 M8)

`firebase.json` turns Analytics' automatic collection off at build time
(`analytics_auto_collection_enabled: false`, no advertising ID or SSAID, no screen reporting,
no ad-related consent defaults). The app turns collection on only while Settings → Privacy →
"Help improve PDF Scan" is on (`services/telemetry/usage.ts`), and logs only these events:

| Event | Parameters |
|---|---|
| `app_open` | none (once per run) |
| `scan_completed` | `pages` |
| `document_saved` | none |
| `document_submitted` | none |
| `pass_started` | none |
| `backup_made` | none |

Turning the toggle off stops collection and resets the Analytics app instance id. To see the
events while testing: `adb shell setprop debug.firebase.analytics.app <package>` and open
DebugView in the console.

## Verify

- Without the files: the app starts, nothing Firebase-related in logcat, ads stay off.
- With them: set `ads_enabled` to `true` in the console and publish; after the next start,
  `getRemoteConfig().adsEnabled` is true (M5 shows the banner).
- With "Help improve PDF Scan" off: no requests to `app-measurement.com` in a proxy. With it
  on: the events above appear in DebugView.
