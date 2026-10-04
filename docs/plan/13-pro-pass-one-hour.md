# §10 revision: 1-hour Pro pass: step-by-step plan

## How to use this file
- Implement **one step per session** ("Implement H1 from docs/plan/13-pro-pass-one-hour.md").
- Read `AGENTS.md`, `docs/plan/README.md`, and only the step you are implementing.
- When a step is done, update its `Status:` line, add "As built" notes, and update `docs/plan/README.md`
  and `docs/PLAN.md` §10 (the "24 hours" line under M6).
- Step prefix **H** (hour pass).

## Context
**Planned 2026-10-04.** Today one rewarded ad gives every Pro feature for **24 hours** (§10 M6, the "Pro day
pass"). The owner wants **1 hour** per ad, so students watch more ads and Pro is worth more.
**Owner's decisions (2026-10-04):**
1. Pass length: **1 hour** per ad.
2. Daily cap stays at **3 passes a day** (`pass_max_per_day` = 3), so at most 3 hours of Pro a day.
3. User-facing name becomes **"Pro pass"** (not "day pass"); any "for the day" wording goes. Code names
   (`dayPass.ts`, `claimDayPass`, `logUsage('pass_started')`) stay the same, so nothing churns.

**How it works today** (no new mechanism needed):
- `src/services/remote/remoteConfig.ts`: `REMOTE_DEFAULTS.passHours = 24`, Firebase key `pass_hours`, parsed
  with `int(1, 168)`. `passMaxPerDay = 3` (`pass_max_per_day`).
- `src/services/ads/rewarded.ts:176`: `claimDayPass(now(), config.passHours, config.passMaxPerDay)`.
- `src/services/pro/dayPass.ts` `applyReward` → `entitlement.grantPass(existing, now, hours)`, which
  **adds** to a running pass (`expiresAt = from + hours * HOUR_MS`). With 1 hour, watching again while
  a pass runs extends it by 1 hour; that is still correct.
- UI copy takes the count from `passHours`: `pro.subtitle`, `pro.watch`, `pro.watchMore`,
  `pro.task.getPass` in `src/i18n/en.ts` (already pluralised, `one: '{count} hour'`).

**Important:** a value of `pass_hours` set in the Firebase console **overrides** the code default.
`docs/firebase.md` lists `pass_hours` = `24`, so if the console has it set, the console value must
change too, or the app keeps giving 24 hours.

**Already-granted passes:** an entitlement stores its `expiresAt`, so a 24-hour pass granted before the
change runs to its end. No migration needed.

## H1 · Turn the pass into 1 hour *(S)*
Status: done in code (2026-10-04). Open for the owner: set `pass_hours` = `1` in the Firebase console and
publish; device checks (Verification 2–4) open.

As built:
- `REMOTE_DEFAULTS.passHours` is `1`; the parser keeps `int(1, 168)`.
- Comments in `remoteConfig.ts`, `rewarded.ts`, `dayPass.ts` and `passEndLabel.ts` say "Pro pass" and
  `pass_hours` (the leftover "day pass" comments in `remoteConfig.ts` and `rewarded.ts` were renamed too).
- Tests: the remote default and the Pro screen's "Watch an ad, get Pro for 1 hour"; a new `dayPass` case
  shows a second 1-hour watch while a pass runs ends 1 h after the first end.

Fastest route, with no release: in the Firebase console → Remote Config, set `pass_hours` = `1` and publish.
Installed apps pick it up on their next fetch (cached for about an hour, `remoteConfig.ts` ~L165).

Code (so new installs and offline first runs get 1 hour too):
- `src/services/remote/remoteConfig.ts`: `REMOTE_DEFAULTS.passHours: 24` → `1`; update the comment
  "Length of a rewarded Pro day pass (M6)" → "Length of a rewarded Pro pass (M6), in hours". Keep the
  parser range `int(1, 168)`, so the console can still change it.
- `src/services/ads/rewarded.ts` header comment (~L10, "for 24 hours") → "for `pass_hours`".
- `src/services/pro/dayPass.ts` header comment ("24 by default") → "1 by default"; "Pro day pass" →
  "Pro pass".
- `src/components/pro/passEndLabel.ts`: the comment says the weekday is there "since a pass often ends
  tomorrow". Keep the weekday, since a pass that is extended or started near midnight still crosses days,
  and only fix the comment's wording.
- Tests:
  - `src/services/remote/__tests__/remoteConfig.test.ts:43`: default `passHours: 24` → `1`.
  - `src/screens/__tests__/ProScreen.test.tsx:61,69`: `'Watch an ad, get Pro for 24 hours'` →
    `'Watch an ad, get Pro for 1 hour'` (the `one` plural form; check that the mock config uses the default).
  - `src/services/pro/__tests__/dayPass.test.ts`: passes `hours` explicitly (24), so it still passes;
    optionally add a case with `hours = 1` showing that a second watch while a pass runs gives `expiresAt` =
    first end + 1 h.
- Done when: `npm run typecheck` and `npm test` pass; with Remote Config defaults, the Pro screen says
  "Watch an ad, get Pro for 1 hour", and a test reward sets `expiresAt` = now + 1 h.

## H2 · Rename "day pass" → "Pro pass" in UI text *(S)*
Status: done in code (2026-10-04). Device check (Verification 2) open.

As built:
- `en.ts`: `settings.developer.proPass` is "Grant a Pro pass"; the five `pro.task.body.*` strings say
  "With a Pro pass there are no ads."
- `settings.developer.proPassInactive` and `pro.task.offlineUsed` are now plurals with `{count}` from
  `passHours` ("Tap for 1 hour of Pro", "A Pro pass unlocks this for 1 hour"), so they follow the console.
  Callers: `SettingsScreen.tsx`'s dev row (whose grant also uses `remote.passHours` instead of a
  hard-coded 24) and `useProTask.tsx`'s `offerPass`.
- `pro.noneLeft` kept as it was.
- "day pass" in source comments (`ProTaskSheet`, `useProTask`, `FileEditor`, `useConvertToPdf`,
  `useConvertToWord`, `proTask`, `proTaskFlow`, `proFeatures`, `readerTools`) and in the `proTask` /
  `proTaskFlow` test titles became "Pro pass". Code names (`dayPass.ts`, `claimDayPass`) are unchanged.

All in `src/i18n/en.ts` (keys stay the same):
- `settings.developer.proPass`: 'Grant a Pro day pass' → 'Grant a Pro pass'.
- `settings.developer.proPassInactive`: 'No Pro. Tap for 24 hours of Pro.' → 'No Pro. Tap for an
  hour of Pro.' (or take `{count}` from `passHours` if the Settings dev row passes it; check
  `src/screens/SettingsScreen.tsx` ~L244).
- `pro.task.body.*`: "With a Pro day pass there are no ads." → "With a Pro pass there are no ads."
- `pro.task.offlineUsed`: "A Pro day pass unlocks this for the day." → "A Pro pass unlocks this for an
  hour." (or "…for {count} hours" if the hours are passed in; then update its caller in
  `ProTaskSheet.tsx`/`useProTask.tsx`).
- `pro.noneLeft`: "That's all the passes for today. Come back tomorrow." is still right with a daily cap;
  keep it.
- Search for any other "day pass" in `.tsx` comments the user can see (none expected) and in
  `src/screens/ProScreen.tsx`'s and `ProTaskSheet.tsx`'s header comments (comments only: rename for
  consistency).
- `hardcodedStrings.test.ts` is unaffected (only en.ts changes).
- Done when: `grep -rn "day pass" src/i18n/en.ts` returns nothing, and tests pass.

## H3 · Docs *(S)*
Status: done (2026-10-04).

As built:
- `docs/firebase.md`: `pass_hours` default `1`, "Pro pass length (hours)", with a note that a console value
  of `24` must be changed to `1` and published; the other "day pass" mentions there became "Pro pass".
- `docs/ads.md`: "get Pro for 1 hour", "now + 1 h", the dev row is "Grant a Pro pass".
- `docs/PLAN.md` §10: "Pro pass", 1 hour (`pass_hours`); also the §12 and P3 mentions. M6's checklist
  title and decision 4 keep "day pass" as history.
- `docs/plan/10-monetization.md`: a dated revision note under M6; the original text stays.
- `docs/policy/privacy-policy.md`: "a Pro pass was started"; "Last updated" moved to 2026-10-04.
- `AGENTS.md`: the three "day pass" mentions say "Pro pass" (1 hour).
- `docs/firebase.md:37`: `pass_hours` default `24` → `1`, "Pro day pass length" → "Pro pass length (hours)".
- `docs/ads.md:15-16,52`: "get Pro for 24 hours" → "1 hour"; "now + 24 h" → "now + 1 h".
- `docs/PLAN.md` §10 (~L239-240): "Pro day pass … for 24 hours" → "Pro pass … for 1 hour (`pass_hours`)";
  note this revision (2026-10-04).
- `docs/plan/10-monetization.md`: add a dated "Revised 2026-10-04: 1 hour, see 13-pro-pass-one-hour.md"
  note under M6 (keep the original text as history, as the README asks).
- `docs/policy/privacy-policy.md:44`: "a Pro day pass was started" → "a Pro pass was started" (the
  wording only; what is logged doesn't change).
- `AGENTS.md`: "Pro day pass" mentions → "Pro pass (1 hour)".

## Risks / things to watch
- **Ad fatigue vs. revenue:** 1 hour × 3 a day caps Pro at 3 hours a day. Watch AdMob rewarded
  impressions and the `pass_started` count after release; both `pass_hours` and `pass_max_per_day`
  can be tuned in the console without a release.
- **A pass ending mid-task:** Pro tasks (§12 D1) check the gate when a task starts; editing sessions have
  their own `edit_unlock_minutes` (30) grant via `proTask.ts`, so a pass ending mid-edit doesn't cut
  the edit off. Confirm this on a device in Verification.
- **Lapse rules** (`proFeatures.ts`, "app lock stays on, covers keep their design") now run hourly
  rather than daily; they already handle a pass ending, so no change is expected. Check them once on a device.
- The rewarded-ad preload window in `rewarded.ts` (~L36, AdMob drops a loaded ad after about an hour) is
  unrelated to the pass length, so leave it alone.

## Verification
1. `npm run typecheck && npm test`.
2. Dev build, Settings (dev) → "Grant a Pro pass": Settings shows "Pro until <now + 1 h>".
3. Pro screen with the test rewarded unit: the button reads "Watch an ad, get Pro for 1 hour"; watch to the
   end and "Pro is on until <now + 1 h>"; watch again and the end moves out by 1 h, then "Watch an ad for
   1 more hour"; after the 3rd pass, "That's all the passes for today."
4. Move the device clock forward 61 minutes (or grant then wait): banners return and Pro tasks show
   ProTaskSheet again; app lock and cover designs follow the lapse rules.
5. Firebase console `pass_hours` = 1 is published; a release build fetches it (check with Remote Config's
   debug view, or in the Settings dev panel if it shows the config).
