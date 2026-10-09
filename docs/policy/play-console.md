# Play Console checklist (§10 M1)

Done by the owner in Play Console. Tick each line here when it's set. Re-check before turning
on `ads_enabled` (M2/M5).

## Before the first release build (§14 Q2)
- [ ] **Ads release checklist** in [docs/ads.md](../ads.md#release-checklist) is done: the real
      AdMob app ID (`ADMOB_ANDROID_APP_ID`), the rewarded and banner units in Remote Config,
      `app-ads.txt`. Without it no real ad can show, and Pro tasks don't run at all (§14 Q1).

## App content
- [ ] **Target audience and content:** ages **13–15, 16–17, 18 and over** (not under 13).
      Do **not** opt in to "Designed for Families". Appeal to children: no.
- [ ] **Ads:** "Yes, my app contains ads" (set this before the first build with the AdMob SDK
      reaches any track, even while `ads_enabled` is off).
- [ ] **Privacy policy:** the URL of the hosted [privacy-policy.md](privacy-policy.md) (§11
      hosts it).
- [ ] **Data safety** (the table below).

## Data safety answers
Collected = leaves the phone. "Optional" = only when the user turns it on.

| Data type | Collected | Shared | Optional | Purpose | Through |
|---|---|---|---|---|---|
| Device or other IDs (advertising ID, Firebase installation ID) | Yes | Yes (Google) | No | Advertising or marketing; App functionality | AdMob, Firebase |
| App interactions (ad views and taps) | Yes | Yes (Google) | No | Advertising or marketing | AdMob |
| Approximate location (from IP) | Yes | Yes (Google) | No | Advertising or marketing | AdMob |
| App interactions (usage counts) | Yes | No | **Yes** | Analytics | Firebase Analytics (M8) |
| Crash logs, diagnostics | Yes | No | **Yes** | Analytics | Sentry (F8) |
| Files and docs, photos | **No** | No | – | – | – (on the phone only) |
| Personal info (name, email, …) | **No** | No | – | – | – |

- [ ] Data is encrypted in transit: yes (all three SDKs use HTTPS).
- [ ] Users can request deletion: yes (uninstall; reset advertising ID; contact).
- [ ] No account creation.

## Store copy
- [ ] Listing text says "no ads while you work" (or "a small ad on Home and Library only"),
      **never** "no ads".
- [ ] No text anywhere (listing, app, screenshots) sends users to pay outside Google Play.
      WhatsApp 01645724080 appears only as a support contact.
- [ ] App icon (512 x 512): upload `assets/store/playstore-icon.png` (made by
      `scripts/make-icons.mjs` from `assets/brand/pdfscan-mark.svg` and `pdfscan-tile.svg`, §15 V2;
      upload it again after the brand refresh).
