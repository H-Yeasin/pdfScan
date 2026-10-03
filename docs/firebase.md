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
| `ads_rewarded_unit_android` | String | (empty) | AdMob rewarded unit for the Pro day pass (M6). Empty = no pass in release builds. |
| `ads_rewarded_unit_ios` | String | (empty) | The same for iOS. |
| `pass_hours` | Number | `24` | Pro day pass length, 1–168. |
| `pass_max_per_day` | Number | `3` | Passes a day, 0–10. |
| `support_whatsapp` | String | `8801645724080` | Digits only, with country code (wa.me). Support only. |
| `support_email` | String | (empty) | Empty = not shown. |
| `pro_sales_enabled` | Boolean | `false` | Paid Pro (M9). Keep false. |
| `min_supported_version` | String | (empty) | e.g. `1.2.0`; older builds see an update message. |

The app reads the values fetched last time a moment after start (they're cached, so this
works offline), then fetches new ones (at most once an hour; every start in dev builds) and
applies them. A console change shows up on the next start.

## Analytics stays off

`remote-config` declares `@react-native-firebase/analytics` as a peer, so npm installs it and
the Analytics SDK is linked. `firebase.json` turns its automatic collection off at build time
(`analytics_auto_collection_enabled: false`, no advertising ID or SSAID, no screen reporting,
no ad-related consent defaults). M8 turns collection on only for students who opt in.

## Verify

- Without the files: the app starts, nothing Firebase-related in logcat, ads stay off.
- With them: set `ads_enabled` to `true` in the console and publish; after the next start,
  `getRemoteConfig().adsEnabled` is true (M5 shows the banner).
- Before M8: no requests to `app-measurement.com` in a proxy.
