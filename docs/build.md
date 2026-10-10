# Building and running PDF Scan

How to build the app on a Mac: development builds on an emulator, a simulator or a phone, clean
builds, a release build for your own phone, an APK, and the AAB for Google Play. Android is the
launch platform; iOS builds and runs, but has no Firebase yet.

Checked on 2026-10-09 against Expo SDK 57 (Expo CLI 57.0.10), React Native 0.86, Gradle 9.3.1,
`@react-native-firebase/app` 26.4 and `@sentry/react-native` 8.28.

- [Quick reference](#quick-reference)
- [1. Why `npx expo prebuild --clean` failed](#1-why-npx-expo-prebuild---clean-failed)
- [2. How the native projects are made](#2-how-the-native-projects-are-made)
- [3. One-time setup](#3-one-time-setup)
- [4. What to rebuild after a change](#4-what-to-rebuild-after-a-change)
- [5. Clean builds](#5-clean-builds)
- [6. Development builds](#6-development-builds) (emulator, Android phone, simulator, iPhone)
- [7. A release build on your own phone](#7-a-release-build-on-your-own-phone)
- [8. APK file](#8-apk-file)
- [9. AAB for Google Play](#9-aab-for-google-play)
- [10. Troubleshooting](#10-troubleshooting)

## Quick reference

| I want to… | Command |
|---|---|
| Run on an Android emulator or phone (dev build) | `npm run android` (`npx expo run:android --device` to pick one) |
| Run on an iOS simulator (dev build) | `npm run ios` (`npx expo run:ios --device "iPhone 17"`) |
| Run on an iPhone (dev build) | `npx expo run:ios --device` |
| Start Metro for a dev build already installed | `npm start` |
| Regenerate `android/` and `ios/` | `npx expo prebuild` (add `--platform android` for one platform) |
| Clean everything and rebuild | [section 5](#5-clean-builds) |
| Release build on my phone (no Metro) | `npx expo run:android --variant release` |
| APK to share with testers | `eas build -p android --profile preview` or, locally, `cd android && ./gradlew assembleRelease` |
| AAB for Google Play | `eas build -p android --profile production` |
| Typecheck and tests | `npm run typecheck && npm test` |

## 1. Why `npx expo prebuild --clean` failed

On 2026-10-09, `npx expo prebuild --clean` stopped with:

```
Error: [ios.xcodeproj]: withIosXcodeprojBaseMod: Path to GoogleService-Info.plist is not
defined. Please specify the `expo.ios.googleServicesFile` field in app.json.
```

What happened, step by step:

1. Every `npx expo …` command loads `.env.local` into its environment first (the
   `env: load .env.local` line in the log). Ours sets `GOOGLE_SERVICES_JSON` (Android's Firebase
   file) but not `GOOGLE_SERVICE_INFO_PLIST` (iOS's), because Firebase is only set up for
   Android.
2. `app.config.js` saw a Firebase file and added the `@react-native-firebase/app` config plugin.
3. `npx expo prebuild` without `--platform` generates **both** `android/` and `ios/`.
4. That plugin always runs its Android half **and** its iOS half. The iOS half needs
   `ios.googleServicesFile` and throws without it. Worse, it also adds
   `FirebaseApp.configure()` to the iOS AppDelegate, which crashes at launch when the plist is
   missing.

It hadn't shown up before because `npm run android` (`expo run:android`) and EAS Android builds
only prebuild Android, so the iOS half never ran. A prebuild for both platforms was the first
thing that ran it.

**Fix (2026-10-09):** `app.config.js` now adds only the half of the Firebase plugin whose file
is set: with only `GOOGLE_SERVICES_JSON`, Android gets Firebase and iOS is built without it
(Remote Config keeps its bundled defaults there, as it did before). With both files set, the
whole plugin runs as normal. The halves are loaded by file path because the package doesn't
export them, so after upgrading `@react-native-firebase/app`, run a prebuild once to check it
still works ([troubleshooting](#10-troubleshooting)).

The general lesson: `android/` and `ios/` are **generated output**, built from the
configuration on every prebuild. When a prebuild fails, the cause is in the inputs (config,
plugins, environment variables), never in the native folders.

## 2. How the native projects are made

The app uses Expo's Continuous Native Generation. `android/` and `ios/` are not committed
(`.gitignore`); `npx expo prebuild` creates them from these inputs:

| Input | What it controls |
|---|---|
| `app.json` | Name, package id, icons, splash, permissions, intent filters, plugin list and options |
| `app.config.js` | Adds to `app.json` from environment variables: Firebase files, real AdMob app ids |
| `plugins/` | This repo's own config plugins (Auto Backup rules, "Open with" filters) |
| `package.json` dependencies | Native modules that get autolinked, and their config plugins |
| `modules/pdf-native/` | The local native module (PDF rendering), autolinked |
| `patches/` | Fixes to `node_modules`, applied by `npm install` (`patch-package`) |

Rules that follow from this:

- **Never edit `android/` or `ios/` by hand.** The next prebuild deletes them. Change
  `app.json`, `app.config.js` or a plugin in `plugins/` instead. (The one exception, a
  local signing setup for an AAB, is [section 9](#9-aab-for-google-play).)
- In SDK 57, `npx expo prebuild` **regenerates from scratch by default**. `--clean` still
  works and does the same; `--no-clean` applies changes on top of the existing folders.
- `npx expo run:android` and `run:ios` run a prebuild themselves only when the folder is
  missing. After changing a config input, run `npx expo prebuild` yourself.

### Where each environment variable is read

| Variable | Read by | When | If it's missing |
|---|---|---|---|
| `GOOGLE_SERVICES_JSON` | `app.config.js` | prebuild | No Firebase on Android; Remote Config uses the bundled defaults (`docs/firebase.md`) |
| `GOOGLE_SERVICE_INFO_PLIST` | `app.config.js` | prebuild | No Firebase on iOS (today's state) |
| `ADMOB_ANDROID_APP_ID`, `ADMOB_IOS_APP_ID` | `app.config.js` | prebuild | Google's sample app id, which only serves test ads (`docs/ads.md`) |
| `EXPO_PUBLIC_SENTRY_DSN` | Metro, inlined into the JS bundle | bundling | Crash reporting stays off (`docs/crash-reporting.md`) |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Sentry's step in the native release build | release builds | The source map upload fails ([troubleshooting](#10-troubleshooting)) |

Two consequences:

- `.env.local` is loaded by `npx expo …` commands only. Running `./gradlew` directly does
  **not** load it (see [section 8](#8-apk-file) for how to load it).
- EAS Build never sees `.env.local`: it's gitignored, so it isn't uploaded. EAS builds use the
  **EAS environment variables** instead (expo.dev ▸ project ▸ Environment variables). Each build
  profile reads one EAS environment: `development` → development, `preview` → preview,
  `production` → production. Set the variables in every environment you build from.

## 3. One-time setup

### Tools

| Tool | Version | Notes |
|---|---|---|
| Node.js + npm | 20 or newer | This Mac: Node 24 |
| Android Studio | current | Brings the Android SDK, emulator and a JDK |
| JDK | 17 or newer | Use Android Studio's bundled one (JDK 21) |
| Android SDK | Platform 36, Build-Tools 36.0.0, NDK 27.1.12297006 | Android Studio ▸ Settings ▸ Languages & Frameworks ▸ Android SDK. Gradle installs missing pieces when it can |
| Xcode + CocoaPods | Xcode 26, CocoaPods current | iOS only. `brew install cocoapods` |
| EAS CLI | 21.4 or newer (`eas.json`) | `npm install -g eas-cli`, then `eas login` |

Add to `~/.zshrc`, then open a new terminal:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Check: `java -version` (17+), `adb version`, `xcodebuild -version`, `pod --version`.

### Project

```bash
npm install          # also applies patches/ (check the "patch-package" lines in the output)
npx expo-doctor      # optional: checks dependency versions and config
```

### Secret files (never commit them, the repo is public)

Both are in `.gitignore`. Keep a copy somewhere safe outside the repo.

- `google-services.json` in the project root (Firebase console ▸ Project settings ▸ Android app).
- `.env.local` in the project root:

  ```bash
  GOOGLE_SERVICES_JSON=./google-services.json
  ADMOB_ANDROID_APP_ID=ca-app-pub-…~…
  EXPO_PUBLIC_SENTRY_DSN=https://…
  SENTRY_ORG=…
  SENTRY_PROJECT=…
  SENTRY_AUTH_TOKEN=…
  ```

  Every line is optional; without one, the build falls back as the table in
  [section 2](#where-each-environment-variable-is-read) says.

## 4. What to rebuild after a change

"Rebuild" means `npm run android` (or `npm run ios`), which recompiles the native app and
installs it.

| You changed | Do |
|---|---|
| TypeScript in `src/`, `App.tsx` | Nothing. Metro reloads (press `r` in the Metro terminal if it doesn't) |
| An `EXPO_PUBLIC_*` variable | Restart Metro with `npx expo start --clear` |
| `app.json`, `app.config.js`, `plugins/`, icons, splash | `npx expo prebuild`, then rebuild |
| Added, removed or upgraded a package with native code | `npm install`, `npx expo prebuild`, rebuild |
| `patches/` | `npm install`, `npx expo prebuild`, rebuild |
| Kotlin or Swift in `modules/pdf-native/` | Rebuild |
| `GOOGLE_SERVICES_JSON`, `ADMOB_*` in `.env.local` | `npx expo prebuild`, then rebuild |
| Firebase Remote Config values | Nothing. The app fetches them on its next start |

## 5. Clean builds

Go one level further only when the level before didn't help.

**Level 1: regenerate the native projects.** Fixes most "it worked yesterday" problems after a
config or dependency change.

```bash
npx expo prebuild                      # both platforms
npx expo prebuild --platform android   # Android only (faster, no CocoaPods)
npm run android
```

**Level 2: also clear the build caches.**

```bash
npx expo run:android --no-build-cache  # clears Android's native build cache
npx expo run:ios --no-build-cache      # clears Xcode's derived data
npx expo start --clear                 # clears Metro's cache (stale JS, changed EXPO_PUBLIC_*)
```

**Level 3: start from nothing.**

```bash
rm -rf node_modules android ios
npm install
npx expo prebuild
npx expo run:android --no-build-cache
```

If Gradle still misbehaves, stop its background daemon with `cd android && ./gradlew --stop`
and try again. Deleting `~/.gradle/caches` also works but downloads several GB again; keep it
as a last resort.

## 6. Development builds

A development build is a debug app with the Expo dev client. It loads the JavaScript from Metro
on your Mac, so code changes show up without rebuilding. The first build compiles all native
code (several minutes); after that, only native changes ([section 4](#4-what-to-rebuild-after-a-change))
need a rebuild. To work on an app that's already installed, run `npm start` and open the app.

Debug builds compile only for the CPU of the device you run on, so they're faster than release
builds, which compile for all four Android CPU types.

### Android emulator

1. Android Studio ▸ Device Manager ▸ **+** ▸ Create Virtual Device ▸ a Pixel phone.
2. System image: **API 36, arm64-v8a, with "Google Play"** (this Mac is Apple Silicon). The
   Google Play image matters: the document scanner is Google's ML Kit scanner, which needs
   Google Play services. Without them the app falls back to its basic camera
   (`capture/scannerFallback.ts`).
3. Start the emulator (Device Manager ▸ ▶, or `emulator -list-avds` then
   `emulator -avd <name>`).
4. `npm run android`. With several devices connected: `npx expo run:android --device` and pick
   one.

The emulator's camera shows a virtual room by default. To scan real paper, use the Mac's webcam
as the back camera: Device Manager ▸ edit the device (pencil) ▸ advanced or additional settings
▸ Camera ▸ Back: **Webcam0**, then cold-boot the emulator.

### Android phone

1. On the phone: Settings ▸ About phone ▸ tap **Build number** seven times. Then Settings ▸
   System ▸ Developer options ▸ turn on **USB debugging**. (Xiaomi phones also need
   **Install via USB**.)
2. Connect it with a USB cable and tap **Allow** on the "Allow USB debugging?" prompt.
3. `adb devices` must show the phone as `device`. `unauthorized` means the prompt wasn't
   accepted: unplug, plug in again, accept.
4. `npx expo run:android --device` and pick the phone.

Over USB, Expo CLI forwards Metro's port, so the phone doesn't need to be on the same Wi-Fi. If
the app can't reach Metro later (after reconnecting the cable, for example):
`adb reverse tcp:8081 tcp:8081`, then reload.

**Without a cable:** Developer options ▸ **Wireless debugging** ▸ Pair device with pairing code,
then on the Mac `adb pair <ip>:<pairing port>` (enter the code) and
`adb connect <ip>:<port shown on the Wireless debugging screen>`. The phone and the Mac must be
on the same Wi-Fi. Then run step 4.

### iOS simulator

```bash
npm run ios                                    # Expo picks a simulator
xcrun simctl list devices available            # list the simulators
npx expo run:ios --device "iPhone 17"          # a specific one
```

`run:ios` runs `pod install` itself when needed. What a simulator can't do: it has no camera,
so scanning doesn't work (importing from Photos does). iOS has no Firebase yet.

### iPhone

1. You need a **paid Apple Developer Program** membership. `expo-notifications` adds the Push
   Notifications entitlement (`aps-environment`), which a free Apple ID ("Personal Team")
   can't sign.
2. Connect the iPhone, tap **Trust**, then on the iPhone turn on Settings ▸ Privacy & Security
   ▸ **Developer Mode** (it restarts).
3. `npx expo run:ios --device` and pick the iPhone. The first time, Expo CLI asks for the
   "Development team for signing the app"; pick yours. (Or set it in Xcode: open
   `ios/PDFScan.xcworkspace` ▸ PDFScan target ▸ Signing & Capabilities ▸ Team. That setting is
   lost on the next prebuild; Expo CLI asks again.)

## 7. A release build on your own phone

A release build has the JavaScript inside the app (no Metro), no dev menu, and real speed. Use it
to check performance (`docs/qa/performance.md`) and anything that behaves differently outside
development.

```bash
npx expo run:android --variant release
npx expo run:ios --configuration Release
```

Know this before you install one:

- **It's signed with the debug key** (the generated `android/app/build.gradle` does that). Fine
  for your own phone; Google Play rejects it.
- **It serves real ads.** Only development builds use Google's test ad units; a release build
  uses the real units from Remote Config. Add your phone as a test device first (AdMob ▸
  Settings ▸ Test devices) and never tap ads on your own phone: AdMob can suspend the account
  for invalid clicks.
- **Sentry uploads source maps** during the build, using the `SENTRY_*` variables from
  `.env.local` (loaded because this runs through `npx expo`).
- The release build and the dev build have the same package id, so one replaces the other.
  Both use the same debug key, so switching between them keeps the app's data.

## 8. APK file

An APK installs directly on a phone (shared by file, link or `adb`). Google Play wants an AAB
instead ([section 9](#9-aab-for-google-play)).

### With EAS (recommended for testers)

```bash
eas build --platform android --profile preview
```

The `preview` profile has `"distribution": "internal"`, so EAS builds an **APK**, signs it with
the app's EAS key, and gives you a link and QR code to install it. It reads the EAS **preview**
environment: put `GOOGLE_SERVICES_JSON`, `ADMOB_ANDROID_APP_ID` and the Sentry variables there
too, or this APK has no Firebase and only test ads.

### Locally

```bash
npx expo prebuild --platform android   # only if android/ is missing or the config changed
cd android
set -a; source ../.env.local; set +a   # Gradle doesn't load .env.local on its own (section 2)
./gradlew assembleRelease
```

The APK is at `android/app/build/outputs/apk/release/app-release.apk`. Install it with
`adb install -r android/app/build/outputs/apk/release/app-release.apk`.

- It's signed with the debug key, like [section 7](#7-a-release-build-on-your-own-phone): good for
  testing, not for Play.
- It contains native code for all four CPU types, so it's large. For a smaller file for a
  64-bit test phone: `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`. Don't
  send that one to testers: many cheap Android Go phones run 32-bit Android and need
  `armeabi-v7a` too.
- To build without uploading source maps to Sentry (no network, or no token):
  `SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew assembleRelease`.
- A debug APK (`./gradlew assembleDebug`, at `…/apk/debug/app-debug.apk`) is a dev client: it
  needs Metro running and is only useful to another developer.

## 9. AAB for Google Play

Do the release checklists first: `docs/ads.md` (release checklist),
`docs/policy/play-console.md`, `docs/firebase.md` and `docs/crash-reporting.md`.

### With EAS (recommended)

```bash
eas build --platform android --profile production
```

- The `production` profile builds an **AAB** and reads the EAS **production** environment.
  Check it has `GOOGLE_SERVICES_JSON` (file, secret), `ADMOB_ANDROID_APP_ID`,
  `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` (secret).
- **Signing:** on the first build EAS creates an upload key and keeps it (see it with
  `eas credentials -p android`). Google Play App Signing holds the key the store signs with; the
  EAS key is the **upload key** Play checks your uploads against.
- **Version numbers:** `eas.json` has `"appVersionSource": "remote"` and `"autoIncrement": true`,
  so EAS raises `versionCode` on every production build. The `version` in `app.json`
  (`1.0.0`) is the version users see; raise it yourself for each release.
- **Uploading:** Google Play needs the very first AAB uploaded by hand: Play Console ▸ Testing ▸
  Internal testing ▸ Create new release ▸ upload the `.aab` from the EAS build page. Later
  builds can go up with `eas submit --platform android --profile production` (needs a Google
  Play service account key set up in EAS) or by hand the same way.
- Test the internal-testing release from the Play Store on a real phone before promoting it.

### Locally (only if you can't use EAS)

```bash
cd android
set -a; source ../.env.local; set +a
./gradlew bundleRelease
```

The AAB is at `android/app/build/outputs/bundle/release/app-release.aab`. **As generated, it's
signed with the debug key and Play Console rejects it.** To upload a local AAB:

1. **Use the upload key Play knows.** If EAS already uploaded a build, download its keystore:
   `eas credentials -p android` ▸ the production build credentials ▸ download the keystore.
   Otherwise create one and keep it with a backup outside the repo:

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore ~/keys/pdfscan-upload.keystore \
     -alias pdfscan-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   An app has one upload key at a time. Losing it means asking Google Play support for a reset.
2. **Put the passwords in `~/.gradle/gradle.properties`** (your home folder, not the repo):

   ```properties
   PDFSCAN_UPLOAD_STORE_FILE=/Users/<you>/keys/pdfscan-upload.keystore
   PDFSCAN_UPLOAD_KEY_ALIAS=pdfscan-upload
   PDFSCAN_UPLOAD_STORE_PASSWORD=…
   PDFSCAN_UPLOAD_KEY_PASSWORD=…
   ```

3. **Point the release build at it** in `android/app/build.gradle`: add a `release` entry under
   `signingConfigs`, and in `buildTypes ▸ release` change `signingConfigs.debug` to
   `signingConfigs.release`:

   ```groovy
   signingConfigs {
       debug { … }
       release {
           storeFile file(PDFSCAN_UPLOAD_STORE_FILE)
           storePassword PDFSCAN_UPLOAD_STORE_PASSWORD
           keyAlias PDFSCAN_UPLOAD_KEY_ALIAS
           keyPassword PDFSCAN_UPLOAD_KEY_PASSWORD
       }
   }
   ```

   This edit is lost on every prebuild. If local AABs become the normal route, move it into a
   config plugin in `plugins/` so prebuild writes it (there isn't one yet).
4. **Raise the version code.** Local builds take `versionCode` from `app.json`
   (`expo.android.versionCode`, `1` when unset), and every upload needs a higher number than
   the last one. Set it in `app.json`, then prebuild. EAS keeps its own counter, so after a
   local upload, tell EAS the new number with `eas build:version:set -p android`, or its next
   build reuses a number and Play rejects it.
5. **Check the signature before uploading:**
   `keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab`. The
   owner must be your upload key, not `CN=Android Debug`.

To try an AAB on a connected phone before uploading:
`npx expo run:android --binary android/app/build/outputs/bundle/release/app-release.aab`.

Mixing EAS and local uploads is where both of the problems above (which key, which version code)
come from. Pick one route for Play uploads and use local builds for testing.

## 10. Troubleshooting

**`Path to GoogleService-Info.plist is not defined`.** Fixed in `app.config.js`
([section 1](#1-why-npx-expo-prebuild---clean-failed)). If it comes back, prebuild Android only
(`npx expo prebuild --platform android`) and check `withFirebaseFor` in `app.config.js`.

**`Cannot find module '…/@react-native-firebase/app/plugin/build/android'`.** An upgrade
changed the package's folder layout. Update `firebasePluginHalf` in `app.config.js` to the new
path (look in `node_modules/@react-native-firebase/app/plugin/build/index.js` for the names).

**`[@sentry/react-native/expo] Missing config for organization, project`.** `app.json` lists the
Sentry plugin twice: `@sentry/react-native` (no options) and `@sentry/react-native/expo` (with
`organization` and `project`). The plugin runs only once and the first entry wins, so the
options in `app.json` are never used and `SENTRY_ORG` / `SENTRY_PROJECT` are. Harmless while
those variables are set (`.env.local`, EAS). Removing the bare `"@sentry/react-native"` entry
would make `app.json`'s options apply (a config-file change: review it as AGENTS.md says).

**The Sentry step fails during a release build.** The `SENTRY_*` variables aren't in Gradle's
environment. Build through `npx expo run:android --variant release`, or load `.env.local` first
(`set -a; source ../.env.local; set +a`), or skip the upload with
`SENTRY_DISABLE_AUTO_UPLOAD=true`.

**`SDK location not found`.** `ANDROID_HOME` isn't set in that terminal
([section 3](#tools)). Open a new terminal after editing `~/.zshrc`.

**Java version errors** ("Unsupported class file major version", "requires Java 17").
`JAVA_HOME` points at an old JDK. Set it to Android Studio's ([section 3](#tools)), then
`cd android && ./gradlew --stop`.

**`INSTALL_FAILED_UPDATE_INCOMPATIBLE`.** The phone has the app signed with another key (an EAS
build vs a local one, for example). The only fix is uninstalling it, which **deletes the
library on that phone**: first make a backup in the app (Settings ▸ Back up everything) and
copy the zip off the phone, then `adb uninstall com.yeasin.pdfscan`.

**The app can't connect to Metro** ("Unable to load script", or a red screen about the
development server). Start it with `npm start`. Over USB, run `adb reverse tcp:8081 tcp:8081`.
Over Wi-Fi, the phone and the Mac must be on the same network.

**Port 8081 is already in use.** Another Metro is running. Close it, or use
`npx expo start --port 8082`.

**The scanner opens a plain camera instead of Google's scanner.** The device or emulator has no
Google Play services. That's the designed fallback; use a "Google Play" emulator image
([section 6](#android-emulator)).

**A change to `.env.local` had no effect.** Build-time variables need `npx expo prebuild` and a
rebuild; `EXPO_PUBLIC_*` variables need `npx expo start --clear`
([section 4](#4-what-to-rebuild-after-a-change)).

**`pod install` fails.** `cd ios && pod install --repo-update`, or `npx expo prebuild
--platform ios` to regenerate the iOS project.
