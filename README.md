# 15-Minute Full-Body Dumbbell Trainer

A guided, timer-driven full-body strength workout that takes about 15 minutes
and runs four times a week. Put the phone on the floor, start the session, and
only look at it during rest.

Local-first and single user: everything lives on the device, there are no
accounts, and the app works fully offline after the first load.

## Status

All eleven milestones of the spec's build order are done.

- [x] **1 — Scaffold**: toolchain, data model, seeded exercise library and both sessions
- [x] **2 — Timer engine**: pure state machine, injected clock, backgrounding catch-up
- [x] **3 — Session player UI**: full-screen player, pause, skip, rest extensions
- [x] **4 — Set logging**: pre-fill, stepper, auto-commit, calibration session
- [x] **5 — Persistence**: IndexedDB, autosave, resume-or-discard
- [x] **6 — Onboarding**: three questions, safety acknowledgement, settings
- [x] **7 — Cues**: generated tones, voice, haptics, wake lock
- [x] **8 — Animations**: 16 hand-authored SVG movements
- [x] **9 — History**: summary, progression nudges, charts, weekly rollup
- [x] **10 — PWA**: installable, offline, JSON export/import, Firebase hosting config
- [x] **11 — Customisation**: session shape, exercise swaps, rotation, theme

## Getting started

```bash
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run type-check` | `vue-tsc -b` across app and tooling configs |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run verify` | type-check + test + build |
| `npm run icons` | re-render the app icons from `scripts/icon.mjs` |

## Architecture

The rule that matters most: **the timer engine is plain TypeScript with no Vue
or Pinia dependency.** It is a pure state machine over a pre-computed segment
list, and it takes an injectable clock (`() => number`, defaulting to
`Date.now`). A Pinia store wraps it and exposes reactive state; the engine knows
nothing about the framework.

This is what makes the timer testable — without an injected clock, verifying a
14:30 session would mean waiting 14:30.

```
src/
  engine/       pure TypeScript: segment list, timer, progression, volume, units
  stores/       Pinia: session, history, library, settings
  composables/  side effects: audio, voice, wake lock, haptics, persistence
  persistence/  IndexedDB (logs and sets), localStorage (settings), export/import
  components/   animations/ player/ ui/
  views/        Home, Player, Summary, History, Settings, Onboarding
  data/         seeded exercise library, session templates, program
```

Side effects stay out of the stores. Audio, wake lock, vibration and persistence
are driven from composables that watch store state.

### Timer engine invariants

Four rules in `src/engine/timer.ts` are load-bearing. Breaking any of them
produces bugs that only show up on a real phone, mid-session:

1. **Boundaries are derived by arithmetic, never from `now`.** When a segment
   ends, the next one starts at `previousStart + duration + pausedTime`. Using
   the current time instead would push the whole remaining session later by
   however long a backgrounded tab was throttled.
2. **Events carry a `missed` flag** rather than being filtered. Audio and
   haptics drop missed cues, so returning to a hidden tab does not replay a
   burst of beeps, while the UI still uses them to move state forward.
3. **Two pause counters.** `pausedAccumulatedMs` is per segment and resets on
   every transition; `totalPausedMs` spans the session and feeds the summary's
   working-time-versus-total-elapsed split.
4. **`extend()` lengthens only the current segment.** Later segments keep their
   own durations and simply shift in wall-clock time.

Auto-commit of a logged set needs no special suppression: pausing blocks
advancement, so a transition segment cannot end while paused, and the commit
that fires on its end therefore cannot either.

### Testing the timer in a browser

Playwright's `page.clock` is what keeps a 14:30 end-to-end run down to
milliseconds, but two details matter:

- **`install()` does not stop the clock.** It swaps in fake timers that still
  tick at real time, which makes every countdown assertion a race. `pauseAt()`
  freezes it, and it has to be called before navigation so the page is frozen
  from its first paint.
- **Wait for the player to render before touching the clock.** Route components
  are lazy-loaded, so the app can still be mounting when `goto` resolves.
  Advancing a frozen clock before the runner's interval exists leaves no timer
  to fire, and it never fires afterwards either.

Long advances use `fastForward` rather than `runFor`: it fires each timer at
most once instead of one per 100ms, which is both far cheaper and the realistic
"screen went to sleep" path through the engine's catch-up logic.

### Persistence

IndexedDB holds session logs, sets, and a single crash-recovery row; settings
stay in `localStorage` because the player needs them synchronously on boot.

Three things here are easy to get wrong:

- **Strip reactivity before writing.** IndexedDB's structured clone throws
  `DataCloneError` on a Vue proxy. `src/persistence/db.ts` round-trips every
  record through JSON at the boundary. Without it, writes fail in a way that
  looks exactly like a browser with storage disabled.
- **Persistence failures are non-fatal but never silent.** A workout must not
  stop because a write did, but a bare `catch {}` hides real bugs, so every
  swallowed failure is logged.
- **Writes are serialised through one promise chain, and each one re-reads
  what it is about to write.** The last tick of a session emits `segment-end`
  and `complete` together; run in parallel, the recovery-row save could land
  after the clear and offer a finished workout for resume. The same tick also
  commits the final set *and* closes the session log — and a queued write
  holding a copy taken when it was scheduled will happily undo a later change,
  which is how every completed session came to be recorded as a partial one.

The recovery row stores the segment list itself rather than rebuilding it, since
a changed lead-in or bench answer would shift every index. Position is stored as
elapsed-within-segment rather than a start timestamp, because a session saved
while paused has a frozen position its raw timestamps no longer describe.

### Cues

Tones are synthesised with the Web Audio API rather than shipped as files:
nothing to fetch, nothing to cache offline, a few hundred bytes instead of a few
hundred kilobytes. Each cue differs in pitch, length and shape rather than only
in volume, so it is identifiable without looking at the phone.

Two things here are less obvious than they look:

- **The AudioContext is created on the tap on Start, on the home screen** — not
  in the player. A context constructed outside a user gesture starts suspended
  and stays that way on iOS, and the player mounts *after* navigation, which is
  too late. That is why the player holds one module-scoped instance rather than
  creating its own.
- **This is where the `missed` flag earns its keep.** Cues are dropped when an
  event fired materially later than it was due, so coming back to a slept phone
  does not replay a dozen beeps for intervals that already went by. There is an
  end-to-end test that fast-forwards ten minutes and asserts at most one tone.

Sound, voice, vibration and wake lock are four independent toggles: a gym is
noisy, and someone with headphones on may want a buzz without a voice talking
over their music.

### Movement animations

Sixteen hand-authored SVGs in `src/components/animations/moves/`, one per
movement. The convention is documented in full at the top of `goblet-squat.vue`
and enforced by `convention.test.ts`, which asserts it against the source of
every file — the only thing that stops sixteen drawings drifting apart one
well-meaning tweak at a time.

The rig is worth understanding before editing one: **forward kinematics from a
planted foot.** The shin rotates about the ankle, the thigh about the knee
inside it, the torso about the hip inside that. Nesting keeps the joints
connected for free and stops the foot sliding off the floor, which is exactly
what goes wrong if each limb is animated independently. Rotations compound down
the chain, so a value that looks large (the torso's) is usually undoing its
parent's rotation before adding its own.

`ExerciseFigure.vue` is a dispatcher: it resolves an exercise's `animation.id`
to its component through a lazy glob, and falls back to a generic figure for
any exercise without its own drawing. Five exercises deliberately share a
drawing where the movement path is identical — a seated and a standing shoulder
press trace the same arc — which is asserted explicitly rather than left to
drift.

### Charts

Hand-rolled SVG, no charting dependency. Three rules the code depends on:

- **Chart marks have their own colour tokens, stepped per mode.** The player's
  accents are deliberately light so they glow on a dark screen at arm's length,
  which puts them outside the chart lightness band and below 3:1 contrast on a
  light surface — measured with the palette validator, not guessed. Chart series
  use `--chart-series` (`#2a78d6` light / `#3987e5` dark), which passes every
  check in both modes.
- **A tooltip is never the only way to read a value.** The line chart carries a
  crosshair and a live readout, and every chart has a "Show values" table.
- **One bar is not a chart.** Weekly volume renders as a plain number until
  there is a second week to compare it to.

Progression nudges only appear for an exercise where *every* round was confirmed
at the top of the rep range, and accepting one writes a `progressionTargets` row
that the next session's pre-fill consults. The target stops applying once the
exercise has been lifted since, so a stale acceptance never overrides a weight
the user has already moved past by hand.

### Installing and working offline

`vite-plugin-pwa` in `generateSW` mode precaches the whole app - 61 files,
about 270 KB - on first load. There is no runtime caching strategy because
there is nothing to fetch at runtime: tones are synthesised, movement demos are
inline SVG, and there is no backend. `navigateFallback` covers the client-side
routes, so `/history` opened cold with no network still resolves to the shell.

**Updates are offered, never taken.** `registerType` is `prompt`, not
`autoUpdate`, and the two are mutually exclusive: on `autoUpdate` the client
calls `window.location.reload()` the moment a new worker activates. That is a
reload landing on someone mid-set with the phone on the floor. On `prompt` the
new worker waits and `UpdatePrompt.vue` offers it - and even then the prompt
stays hidden while a session is running.

Two things to know before writing a test that touches the worker:

- **`page.waitForFunction` does not await an async predicate.** It tests the
  returned Promise for truthiness, and a Promise is always truthy, so
  `waitForFunction(async () => false)` resolves immediately. Awaiting
  `navigator.serviceWorker.ready` inside `page.evaluate` is the primitive that
  actually waits.
- On `prompt` registration Workbox does not call `clientsClaim`, so the page
  that installed the worker is never controlled by it. A reload is what hands
  over control.

The icons come from one source, `scripts/icon.mjs`, rendered by `npm run
icons`. The mark is a dumbbell with a single fat plate per side, and the shape
was chosen by rendering candidates at 48px and looking at them: a more literal
two-plate dumbbell collapses into a striped sliver at home-screen size. The
maskable variant scales to 0.8 because a launcher may crop to a circle of 80%
diameter, and the mark's corners sit outside that at full size.

### Export and import

JSON export is the only way data leaves the device, and import is therefore the
only way a user can lose history. Three rules follow:

- **Import replaces; it does not merge.** The app is single-user and
  single-device by design, so the case to serve is moving to a new phone. A
  merge would answer a multi-device question the app does not have, while
  quietly producing a history that never happened on any one device. The cost
  is that replace can destroy data, so it is spent behind a confirmation that
  names the count it is about to delete, with the destructive button styled and
  positioned as the one you have to reach for.
- **Validate everything before writing anything.** A half-applied import is
  worse than a rejected one, because the user cannot tell what survived.
  `parseImport` returns either a complete typed payload or a message, and never
  touches storage; `replaceAll` then does the wipe and the writes in a single
  IndexedDB transaction, so a failure rolls back rather than leaving the device
  with neither its old history nor the file's.
- **The file carries `format` and `version`.** Without them a future shape
  change gets silently mis-parsed into plausible-looking wrong data, and any
  other JSON on the phone looks like a candidate.

Export prefers the Web Share sheet where it exists and falls back to a
download. On an iOS home-screen app a plain `<a download>` has nowhere to put
the file - Safari opens the JSON in a tab - so sharing to Files is the only
route off the device. The export is built synchronously from the in-memory
history mirror rather than by reading IndexedDB, which is what keeps it inside
the click's user gesture: Safari drops the gesture across an `await`, and
without one the share is refused.

### Hosting

`firebase.json` serves `dist/` with an SPA rewrite, hashed assets and the
Workbox runtime as `immutable` for a year, and `index.html`, `sw.js` and
`manifest.webmanifest` as `no-cache` - a cached `index.html` or worker is how
users get stuck on a build forever. Icons are not content-hashed, so they get a
day rather than a year.

`.firebaserc` holds a placeholder project id. The deploy workflow reads
`FIREBASE_SERVICE_ACCOUNT` in a first job and passes a flag to the second,
because the `secrets` context is not readable from a job-level `if` - without
that, deploy would fail on every push until the secret exists and paint `main`
red for a reason nobody can act on.

### Customisation

The seeded templates in `src/data/sessions.ts` stay immutable; customisation
lives in settings and is applied when the segment list is built. That is what
makes "reset to the default program" a thing the app can always do.

`buildOptionsFor(settings, sessionId)` is the single place those choices are
composed, and both the home screen preview and the running session go through
it — the same rule that already stopped the home screen promising a bench press
to someone without a bench. Explicit swaps are layered *over* equipment
substitutions, so a movement the user picked wins over one the bench answer
inferred; the swap picker filters out anything their equipment cannot do, since
an explicit choice would otherwise stick.

Two details are less obvious than the controls make them look:

- **Rounds are recorded on the session log.** Progression requires every round
  cleared at the top of the range, so judging a three-round session against a
  rounds setting the user has since changed to four would silently withhold
  every suggestion it earned.
- **The fourth-shoulder-set option is a trade, not an addition.** Session B's
  side plank is 30 s per side and a work segment plus its transition is 40 + 20,
  so swapping one for the other leaves the session exactly 14:30 — which is
  what makes it something the spec can offer without an asterisk. The extra set
  carries a transition of its own, because that is where a set gets logged.

Which session comes next is read from history rather than stored, and only
*completed* sessions rotate it: a session abandoned after ninety seconds is not
one the user has done, and rotating past it would quietly drop it from the
week. The home screen carries a one-tap override for when they disagree.

### Two themes, one palette

The theme is a class on `<html>`, applied from `localStorage` in `main.ts`
*before* the app mounts — the document ships as `class="dark"`, so a
light-theme user would otherwise get a dark frame painted and then swapped on
every cold start. `auto` keeps following `prefers-color-scheme` live, so a
phone that flips at sunset does not need the app reopened.

Every accent token is defined twice, and they move in opposite directions.
The app pairs every accent background with `text-surface`
(`bg-work text-surface`), so `--color-surface` is both the page behind the
button and the label on it: near-black text on a light green in dark mode,
near-white text on a dark green in light mode. Values were measured against
WCAG AA rather than eyeballed — the lightest passing colour plus a step of
margin, 5.3:1 or better throughout, and checked to be inside sRGB, since a
dark amber at the dark theme's chroma simply does not exist.

## Toolchain notes

**TypeScript is pinned to 5.9.3 on purpose — do not bump it to 7.x.**
`vue-tsc` patches `typescript/lib/tsc`, which the TypeScript 7 native port no
longer exposes through its package exports, so type-checking dies with
`ERR_PACKAGE_PATH_NOT_EXPORTED`. The peer range `>=5.0.0` does not express this.
A non-blocking `typescript-canary` CI job runs `vue-tsc` against
`typescript@latest` so we find out when the pin can be lifted.

`vue-tsc` is worth keeping: plain `tsc` cannot see inside `.vue` files at all,
so template-level mistakes (a `props.rounds` typo against a `round` prop) reach
production silently.

Other things worth knowing:

- **Tailwind v4** is CSS-first. There is no `tailwind.config.js`; theme tokens
  and the `dark` class variant are declared in `src/styles/main.css`.
- **Vitest 4** rejects a `test` key inside `vite.config.ts`, so test config
  lives in `vitest.config.ts`.
- TypeScript is split across four projects. `tsconfig.app.json` is DOM-only,
  `tsconfig.node.json` covers build tooling, and `tsconfig.vitest.json` and
  `tsconfig.e2e.json` need both - a single config drags Node-typed declarations
  into the browser program. Watch out when moving files between them: `exclude`
  is inherited through `extends` and applied *after* `include`, and a project
  that ends up matching no files typechecks clean and silent.
- Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to point at an existing Chromium if you
  are in a sandbox whose pre-installed browser does not match the Playwright
  version.
- **Node 24 (active LTS).** Node 20 reached end of life in April 2026 and 22 is
  in maintenance. `engines` is `^22.12.0 || >=24.0.0`, derived from what the
  toolchain actually declares: Vite needs >=22.12, and Vitest lists
  `^20 || ^22 || >=24`, deliberately excluding the odd-numbered, non-LTS 23.
- CI actions are pinned to `@v7`. Worth knowing before bumping them: the first
  major running on node24 differs per action — `upload-artifact@v5` is still on
  node20, while `checkout` and `setup-node` moved at v5. A uniform bump to v5
  would have left the deprecation in place.

## Safety

The app suggests weight increases from logged numbers alone. It shows a one-
screen acknowledgement during onboarding covering that this is general
information rather than medical advice, and every progression nudge carries a
one-tap override.

**The safety copy is a starting point, not cleared copy.** It needs legal review
before any public launch, and in the EU it is worth confirming the app stays
outside medical-device classification — the automatic progression suggestions
are the feature most worth checking.

## Out of scope

No accounts, cloud sync, or multi-device (JSON export/import is the only way to
move data). No automatic rep detection, social features, wearables, nutrition
tracking, or barbell/machine exercises.
