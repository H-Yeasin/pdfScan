# Blank screen after a JS reload, and the consent error (2026-10-23)

Measured on the Android emulator (`sdk_gphone64_arm64`, Android 16 / API 36, 2 GB), dev build of
this branch, Metro on the Mac. Device checks on a real phone are at the end.

## Result

- **Cause:** a JS reload is blank only after a **fatal JS error** earlier in the same activity (a
  RedBox: an error while the bundle loads, or Skia failing to install when a second reload lands
  during startup). React Native 0.86's bridgeless `ReactHostImpl.handleHostException` then
  destroys the host, which stops the activity's surface and clears `attachedSurfaces`. Every later
  reload (Metro's `r`, the RedBox's Reload, the dev menu) builds a new instance and restarts the
  surfaces on that list: none. Nothing renders until the activity is recreated. Dev builds only:
  a release build has no reload, and a fatal error closes it.
- **Not the splash intro.** None of the four hypotheses (below) holds: in every blank run React
  never mounted, so `SplashIntro` never rendered. The 2026-10-22 `SplashIntro` change (in
  `git stash` as "hypothesis 2026-10-22 …") is not needed and isn't applied.
- **Fix:** `plugins/withDevSurfaceRestart.js` adds to `MainActivity`, in debug builds only: when a
  React instance is up and the activity's surface is no longer on the host's list, start it again
  (`ReactDelegate.loadApp()`). Needs a new dev build (`npx expo prebuild --platform android`, then
  `npx expo run:android`).
- **Consent:** the "Ads not started … no form(s) configured" error is UMP's `requestInfoUpdate`
  failing because the AdMob account has no GDPR message. It fails in every geography, not just
  the EEA. The old code turned it into "ads off everywhere"; `adsSdk.ts` now follows Google's
  flow (log it, then ask `canRequestAds`), which with no message means ads run everywhere with
  no consent form. Making the GDPR message is a release blocker (`docs/ads.md`).

## Reproduction counts

A run is **blank** when the screen below the status bar is one colour (window background
RGB 250,250,250) and stays so (25-30 s, the emulator was slow by then). Each reload sends Metro's
`r` message (`{"version":2,"method":"reload"}` on `/message`); after each, a screencap, a
uiautomator dump and the JS log were saved.

| Build | Sequence | Blank |
|---|---|---|
| without the fix | plain reload from Home, 20 times | **0/20** |
| without the fix | fresh launch → startup error (RedBox) → error removed → RedBox **Reload** | **15/16** (4 trials void: no RedBox came up, so the sequence never started; the 16th ended on the launcher) |
| with the fix | the same, 20 trials | **0/20**, Home 5-7 s after Reload |
| with the fix | plain reload from Home, 20 times | **0/20**, one `Running "main"` each, no surface errors |
| fix undone (rebuilt without it) | startup error sequence, 10 trials | **10/10** |

Other routes, without the fix (one trial each): the RedBox's **Dismiss** → blank, and `r` after
it → still blank; `r` while the RedBox is up → the RedBox stays through 6 reloads, nothing
underneath. A second reload 0.8-1.5 s after the first sometimes made Skia fail at startup
("Native Skia Module failed to correctly install JSI Bindings!", a RedBox too), and every reload
after that was blank: a natural way to get here without a code error.

## The hypotheses, and what separated them

| | Hypothesis | Separating observation | Seen in the blank runs |
|---|---|---|---|
| H1 | overlay stuck at opacity 0 over its Pressable | "Skip intro" node present, exit started, no exit callback | no node, no `SplashIntro` log at all |
| H2 | overlay stuck opaque, exit never started | node present, logo drawn, app-background colour | no node, window background (250,250,250) |
| H3 | boot hangs, overlay leaves at the 3 s cap over nothing | `SplashIntro` logs, no "boot ready", app background (245,234,216) | no JS of the app ran |
| H4 | AppLockGate stuck on `unknown` | boot done, lock `unknown`, app background | no JS of the app ran |
| H5 | no React surface after the reload | `Running "main"` missing; `ReactSurfaceView` with no children | **yes, every blank** |

Temporary logs (removed) recorded `SplashIntro`'s state changes, the exit callback, "boot
ready"/"boot cap", and AppLockGate's status. Touch: a tap on the Files tab changed nothing.

## Evidence

The fatal error destroys the host (logcat, without the fix):

```
E/ReactNativeJS: [runtime not ready]: Error: TEMP-DIAG: startup error
W/unknown:BridgelessReact: ReactHost{0}.handleHostException(message = "[runtime not ready]: Error: TEMP-DIAG: startup error, …
W/unknown:BridgelessReact: ReactHost{0}.getOrCreateDestroyTask(): Starting React Native destruction
W/unknown:BridgelessReact: ReactHost{0}.getOrCreateDestroyTask(): Stopping all React Native surfaces
```

The reload after it restarts nothing (no `Running "main"` follows, `ReactSurfaceView` has no
children in `dumpsys activity top`):

```
W/unknown:BridgelessReact: ReactHost{0}.getOrCreateReloadTask(): Starting React Native reload
W/unknown:BridgelessReact: ReactHost{0}.getOrCreateReloadTask(): Restarting previously running React Native Surfaces
W/unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask(): Executing ReactInstanceEventListeners
```

With the fix, the same reload:

```
W/unknown:BridgelessReact: ReactHost{0}.getOrCreateReloadTask(): Restarting previously running React Native Surfaces
W/unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask(): Executing ReactInstanceEventListeners
W/unknown:BridgelessReact: ReactHost{0}.startSurface(surfaceId = 1): Schedule
I/ReactNativeJS: Running "main" with {"rootTag":1,"initialProps":{},"fabric":true}
```

Source (react-native 0.86, `ReactHostImpl.kt`): `handleHostException` → `destroy(method, e)`;
`getOrCreateDestroyTask` → `stopAttachedSurfaces(...)` then `attachedSurfaces.clear()`;
`startAttachedSurfaces` restarts only `attachedSurfaces`. `expo-dev-launcher` intercepts Java
errors (`showNewJavaError`), not JS ones, so nothing else recovers the surface.

## Consent: no GDPR message in AdMob

Release app ID `ca-app-pub-4041405565106438~3053145459` (in this dev build through
`.env.local`). For each geography: `AdsConsent.reset()`, then the two calls `gatherConsent` makes,
one at a time (emulators are UMP test devices since UMP 2.2.0; the library ships UMP 4.0.0):

| debugGeography | Call that fails | Code | `getConsentInfo()` after | AdsSdkState, old code | AdsSdkState, new code |
|---|---|---|---|---|---|
| (none, real) | `requestInfoUpdate` | `consent-update-failed` | `canRequestAds: true`, status `UNKNOWN`, no form | `unavailable`, reason `sdk` | `ready` |
| EEA | `requestInfoUpdate` | `consent-update-failed` | the same | `unavailable`, `sdk` | `ready` |
| NOT_EEA (and OTHER) | `requestInfoUpdate` | `consent-update-failed` | the same | `unavailable`, `sdk` | `ready` |

The message each time: "Publisher misconfiguration: Failed to read publisher's account
configuration; no form(s) configured for the input app ID." `loadAndShowConsentFormIfRequired`
then resolves without a form; `getGdprApplies()` is `false`. The new code's states were read on the
emulator through the dev setting below (`{"debugGeography":1}` and `{"debugGeography":2}` reached
UMP).

Decisions:

- **A consent error still allows ads when `canRequestAds` is true** (Google's flow: "If an error
  occurs during the consent gathering process, check if you can request ads"; "The UMP SDK uses
  the consent status from the previous app session"). It keeps ads for a student who answered
  before and is offline at launch. A failed step with `canRequestAds` false is reason `sdk`, not
  `consent` (Ad choices can't fix it). The cost: with no GDPR message, UMP 4.0 says true with
  status `UNKNOWN`, so ads run in the EEA with no form. The GDPR message is now a release
  checklist item in `docs/ads.md`.
- **Dev builds keep the consent path** (the 2026-10-22 idea of skipping it in `__DEV__` is
  dropped), with a debug setting: `EXPO_PUBLIC_ADS_CONSENT_GEOGRAPHY=EEA|NOT_EEA` and
  `EXPO_PUBLIC_ADS_TEST_DEVICE_IDS` in `.env.local` (restart Metro). Release builds ignore both.

## Release variant

On the emulator (a Google Mobile Ads and UMP test device by default; no phone was at hand):
`SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:android --variant release`, with the new
`adsSdk.ts`. It is the first build of §16 G8's R8 and resource shrinking: it built in 5 min 51 s
(R8 warned only about stack maps in `play-services-auth-21.5.0`) and started without a crash,
`Running "main"` 0.5 s after launch. logcat:

```
W/UserMessagingPlatform: Publisher misconfiguration: Failed to read publisher's account configuration; no form(s) configured for the input app ID. …
W/ReactNativeJS: 'Ads consent step failed', { [Error: Publisher misconfiguration: …] … code: 'consent-update-failed' }
I/Ads: This request is sent from a test device.
```

Home showed a banner labelled "Test Ad". So a release build with no GDPR message serves ads with
no consent form (test ads here only because the emulator is a test device); with the old code it
would have shown none.

## Also seen: blank after onboarding's Skip (not investigated)

Once, after tapping **Skip** on a fresh install's onboarding (no reload involved), the window
stayed blank (250,250,250) with Home fully mounted underneath (`dumpsys activity top`: the
scroll view, texts and tab bar), while uiautomator listed nothing below `SafeAreaProvider`: the
layer holding Home was invisible to Android (opacity 0 or moved off screen). A reload cleared
it. Skip calls `go('home')`, a slide that animates the shell layer with the native driver
(`navigation/ScreenStack.tsx`). Not reproduced or explained yet; worth its own session, as it
would reach new users in a release build.

## Checks only the owner can do

- AdMob ▸ Privacy & messaging: create and publish the GDPR message for the app.
- Then, in a dev build with `EXPO_PUBLIC_ADS_CONSENT_GEOGRAPHY=EEA` (emulator, or a phone with
  its hashed id in `EXPO_PUBLIC_ADS_TEST_DEVICE_IDS`): the form appears at the next ads start;
  without the variable, outside the EEA, no form and `SDK: ready`.
- A new dev build on your phone (the fix is native), then: a startup error, fix it, Reload → the
  app comes back.
- The release variant on a real phone registered as an AdMob test device (only the emulator was
  available here).
