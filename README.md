# 15-Minute Full-Body Dumbbell Trainer

A guided, timer-driven full-body strength workout that takes about 15 minutes
and runs four times a week. Put the phone on the floor, start the session, and
only look at it during rest.

Local-first and single user: everything lives on the device, there are no
accounts, and the app works fully offline after the first load.

## Status

Under construction, built in milestones against the product spec.

- [x] **1 — Scaffold**: toolchain, data model, seeded exercise library and both sessions
- [x] **2 — Timer engine**: pure state machine, injected clock, backgrounding catch-up
- [x] **3 — Session player UI**: full-screen player, pause, skip, rest extensions
- [x] **4 — Set logging**: pre-fill, stepper, auto-commit, calibration session
- [x] **5 — Persistence**: IndexedDB, autosave, resume-or-discard
- [ ] 6 — Onboarding and safety acknowledgement
- [ ] 7 — Audio, voice, haptics, wake lock
- [ ] 8 — SVG movement animations
- [ ] 9 — Charts, progression nudges, weekly summary
- [ ] 10 — PWA shell, offline, export/import
- [ ] 11 — Customisation screens

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
  persistence/  IndexedDB (logs and sets) and localStorage (settings)
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
- **Writes are serialised through one promise chain.** The last tick of a
  session emits `segment-end` and `complete` together; run in parallel, the
  save could land after the clear and offer a finished workout for resume.

The recovery row stores the segment list itself rather than rebuilding it, since
a changed lead-in or bench answer would shift every index. Position is stored as
elapsed-within-segment rather than a start timestamp, because a session saved
while paused has a frozen position its raw timestamps no longer describe.

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
- TypeScript is split across `tsconfig.app.json` (DOM) and `tsconfig.node.json`
  (build tooling) because a single config drags Node-typed declarations into the
  browser program.
- Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to point at an existing Chromium if you
  are in a sandbox whose pre-installed browser does not match the Playwright
  version.

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
