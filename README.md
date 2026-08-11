# Queue Quest

Onsale operations strategy game — design a fair virtual queue for high-demand ticket events.

**This directory is the canonical Queue Quest app** (Vite + React + TypeScript).
The original single-file prototype has been moved to `archive/queue-quest-prototype.html` for reference only.

## Development

```bash
npm install
npm run dev        # Vite dev server (default port 5173)
npm run test       # Vitest regression suite
npm run typecheck  # tsc --noEmit
npm run build      # production build → dist/
npm run preview    # preview built dist/ locally
```

## CSS Strategy

This project uses **plain CSS**, not Tailwind utilities. The design system lives in `src/styles.css`.

- All color, spacing, and layout classes are hand-written in `src/styles.css`.
- The classes intentionally mirror the Tailwind naming used in the original prototype (`bg-cyan-500`, `text-slate-400`, etc.) so component JSX reads naturally, but they are plain CSS — no PostCSS/Tailwind pipeline is required.
- A local `postcss.config.js` (empty plugins) shadows any parent-directory PostCSS config, so Vite does not accidentally pick up an unrelated Tailwind setup.

If you introduce a new class that isn't in `src/styles.css`, it will silently no-op. Add the class to `styles.css` when you use it.

## Deployment — GitLab Pages

A `.gitlab-ci.yml` is included. On push to `main` it:

1. Installs dependencies via `npm ci` (with cache)
2. Runs `npm run test`
3. Runs `npm run build`
4. Moves `dist/` → `public/` (GitLab Pages convention)
5. Publishes `public/` as the Pages artifact

The Vite `base` is `'./'` for portability — the same build works at any Pages subpath. If you need an explicit base, set `VITE_BASE_PATH` as a CI/CD variable.

## Project Structure

```
src/
├── data/            # levels.ts (campaign missions), defaults.ts (config + TRAINING_LEVEL + option tables), tours.ts (UI walkthrough steps)
├── game/            # pure logic — no React/DOM:
│   ├── balance.ts       # ★ SINGLE SOURCE OF TRUTH for every gameplay constant (incl. DAILY)
│   ├── types.ts         # shared model types
│   ├── simulation.ts    # one-shot campaign scoring
│   ├── projections.ts   # pre-launch forecast (reads balance.ts, stays in sync with sim)
│   ├── recommendations.ts # debrief: primary cause + per-metric why/fix diagnostics
│   ├── explanations.ts  # per-metric cause analysis + run causal summary (Results screen)
│   ├── ranks.ts         # score → medal band (reads balance.RANK)
│   ├── records.ts       # persistence, migration pipeline, mastery, campaign + daily records
│   ├── daily.ts         # seeded deterministic Daily Challenge generator
│   ├── dateUtils.ts     # local-calendar date keys (daily resets at local midnight)
│   ├── uiTour.ts        # first-time walkthrough flags (own key: queueQuest.uiTour.v1)
│   ├── endless.ts       # deterministic survival sim (reads balance.ENDLESS)
│   ├── decisions.ts     # live operational decisions (reads balance.DECISION)
│   ├── scenario.ts      # deterministic per-mission pre-launch modifier
│   ├── audio.ts         # swappable no-op sound sink
│   ├── analytics.ts     # swappable no-op event sink (future integration point)
│   ├── devtools.ts      # debug flag, QA record-seeding, dev-only profiling
│   └── debugControl.ts  # dev bridge: debug panel ⇄ live Endless Shift
├── components/
│   ├── ui/          # Icon, GameSlider, SegmentedControl, primitives (StatusChip, RiskMeter, ConsolePanel, WarningAlert, MedalBadge)
│   ├── game/        # PressureHUD, QueueTraffic
│   ├── tour/        # UiTour (spotlight walkthrough engine) + ScreenTour (auto-offer + Help replay)
│   └── DebugPanel.tsx   # developer-only overlay (mounts only when debug is enabled)
├── screens/         # TitleScreen, LevelSelectScreen, TrainingScreen, BriefingScreen, ConfigurationScreen, SimulationScreen, ResultsScreen, CampaignCompleteScreen, EndlessBriefing/Shift/Report
├── App.tsx          # screen state machine + daily flow + analytics/debug wiring
├── main.tsx         # entry
└── styles.css       # production CSS design system
```

## Architecture & Game Loop

Queue Quest is a **fully client-side, deterministic** game. The `src/game/` layer is pure logic (no React, no DOM, no randomness), which is what makes it exhaustively testable and safe to tune.

- **Screen state machine** — `App.tsx` holds a single `ScreenState` and swaps screens. There is no router; navigation is state transitions (`title → training? → levelSelect → briefing → config → simulating → results → …`, plus the Endless and campaign-complete branches).
- **Two independent sims:**
  - **Campaign (one-shot):** `runSimulation(level, config)` scores a configured onsale across six metrics → an overall score → a rank band. `calculateProjections()` forecasts the same metrics live on the Configuration console so the player can tune before committing; it reads the *same* `balance.ts` weights so the forecast stays consistent with the result.
  - **Endless (tick loop):** `stepEndless(state, config)` advances exactly one shift-second. `EndlessShiftScreen` drives it on a `setInterval` (1s). Waves, incidents, and live decisions are pure functions of the tick count — same config → identical shift.
- **Determinism:** nothing in `src/game/` calls `Math.random()` or `Date.now()`. Time is injected (`applyResult(store, level, result, now)`), so records logic is testable and reproducible.
- **Records flow:** every run funnels through `applyResult` / `applyEndlessResult`, which return a *new* immutable store plus an `improvements` delta used to celebrate new bests. `App` persists the store to LocalStorage on every change.
- **Side-effect hooks:** `audio.ts` and `analytics.ts` are identical swappable-sink patterns — gameplay code calls `playSound(event)` / `track(event, props)`, and a real backend can be registered later via `setAudioSink` / `setAnalyticsSink` with zero call-site changes.

## Tuning — Balance Config

**All gameplay constants live in one place: [`src/game/balance.ts`](src/game/balance.ts).** After playtesting, tune values there — every other module imports from it, so there are no magic numbers scattered across the codebase.

Grouped, documented exports:

- `RANK` — fail / strong-clear / master deltas relative to par.
- `SIM` — campaign scoring: bot/friction tables, server-load model, checkout, satisfaction, fairness weights.
- `PROJECTION` / `ALERT` / `RISK_METER` — pre-launch forecast coefficients, alert trigger thresholds, and risk-meter color bands.
- `ENDLESS` — wave/incident timing, pressure growth, per-tick decay of stability/fairness/patience, throughput, combo multiplier.
- `DECISION` — decision cadence, on-screen timeout, and modifier duration.
- `UI` — countdown speeds and reveal/count-up timings (non-sim pacing).
- Shared lever tables (`BOT_DETECTION_EFFECTIVENESS`, `VERIFICATION_FRICTION`, resale tables, …) used by both the campaign sim and projections so they can't drift apart.

Modules like `ranks.ts`, `endless.ts`, and `decisions.ts` re-export their headline constants (`STRONG_CLEAR_DELTA`, `TICKS_PER_WAVE`, `DECISION_PERIOD`, …) from `balance.ts`, so existing import paths and tests are unchanged. `balance.test.ts` pins the headline values so an accidental drift fails loudly and a deliberate tune is a one-line, reviewed change.

> Mission par scores live on each level in `src/data/levels.ts` (they're mission data, not global tuning), with the band math (`par + 6` / `par + 12`) centralized in `balance.RANK`.

## Developer Tools

None of this is reachable in normal play.

### Debug panel

Enable with `?debug=1` in the URL (persists to a `queueQuest.debug` LocalStorage flag) or set that flag manually. Disable with `?debug=0`. A red **⚙ DEBUG** button appears; the panel offers:

- **Jump to any mission** (1–5) and **Go to Endless**.
- **Unlock campaign** (clear all), **Master everything**, **Unlock Endless**, **Seed fresh player**, **Reset records** — all built on the pure seed helpers in `devtools.ts`.
- **View current state** — active screen, cleared/mastered counts, endless runs, training status.
- **Endless (live):** *Suppress incidents* toggle and *Force collapse* — routed to the running shift via `debugControl.ts` (a tiny observable bridge), using an optional `stepEndless(..., { suppressIncidents })` param that defaults to exact production behavior.

### QA record utilities (`devtools.ts`)

Pure `RecordsStore` builders — `seedFreshStore`, `seedCampaignCleared`, `seedCampaignMastered`, `seedEndlessUnlocked`. Used by the debug panel and by tests to jump to any progression state deterministically.

### Profiling (`devtools.ts`)

`profile(label, fn)` and `profileMark(label)` are gated behind `import.meta.env.DEV`, so they are **dead-code-eliminated from production** (verified: the `qq-profile` marker string does not appear in the built bundle).

## Analytics

`src/game/analytics.ts` is a lightweight, no-backend event bus. `track(event, props, at?)` fans typed events out to a sink that is a no-op by default and never throws. Events wired today: `app_started`, `training_started/completed/skipped`, `mission_started/completed/failed`, `mastery_earned`, `record_broken`, `campaign_completed`, `endless_started/ended`, `decision_taken/ignored`, `records_reset`. Register a real backend later via `setAnalyticsSink` — no call sites change.

## Save Versioning & Migration

Records persist under a single versioned key (`queueQuest.records.v1`). `parseStore` runs a documented pipeline: reject non-objects → **migrate** older-but-known versions up to `RECORDS_VERSION` → **sanitize** every field with safe defaults. Future/unsupported/corrupt data resets to a fresh store rather than guessing. To add a v2 schema later: bump `RECORDS_VERSION`, add a `MIGRATIONS[1]` step, and add a migration test — the pipeline already loops through the chain. Onboarding flags are additive/optional, so today's v1 saves load unchanged.

## Developer Workflow

```bash
npm run dev        # iterate; add ?debug=1 to the URL for the debug panel
npm run typecheck  # tsc --noEmit (strict)
npm run test       # vitest — pure-logic regression suite (the safety net for tuning)
npm run build      # tsc + vite build → dist/
```

Tuning loop: edit `balance.ts` → `npm run test` (balance-integrity + determinism tests confirm nothing unintended shifted) → `npm run dev` with `?debug=1` to jump straight to the relevant mission/shift and feel the change.

## Gameplay Rules

- 5 progressive levels: Small Venue → Arena → Festival → Playoff → Mega Artist Tour.
- 8 lever categories, 9 controls (Entry Waves has count + interval).
- No real brands, artists, teams, or venues are used.

## Onboarding — UI Walkthrough (First-Time Tours)

Separate from the Training Shift (which teaches *gameplay*), a clickable **interface walkthrough** explains each screen the first time the player reaches it:

- **Engine** (`src/components/tour/UiTour.tsx`): spotlights one *real* DOM element at a time — steps declare `data-tour` anchor names, the engine dims everything else via a box-shadow cutout, and a compact coach panel (Back / Next / Skip Tour / Finish, "3 of 7" progress) repositions above/below the target based on viewport space. Steps whose anchors are missing or invisible are skipped safely; if *nothing* is presentable the tour bails without marking itself seen, so it re-offers later.
- **Coverage** (`src/data/tours.ts`): Home/Title, Mission Board (including the Daily Challenge and Endless cards), Mission Briefing, Configuration console, Results (which explicitly teaches that metric cards expand), Endless entry, plus a one-step note on the first Daily briefing.
- **First-time behavior** (`src/game/uiTour.ts`): completion/skip flags persist under their own key, `queueQuest.uiTour.v1` — deliberately separate from game records so resetting gameplay never re-forces tours (and vice versa). Each tour auto-offers once per screen via `<ScreenTour>`; a small fixed **"?" Help control** replays the current screen's tour anytime.
- **Accessibility**: dialog semantics (`role="dialog"`, `aria-modal`), focus moves into the panel and is restored on close, Tab is trapped within the panel, Escape skips, Arrow keys navigate, step + progress announced via a live region, reduced-motion users get instant transitions.

## Daily Challenge

One deterministic fictional onsale per **local calendar day** (`src/game/daily.ts`):

- **Seeded generation**: the `YYYY-MM-DD` date key (local — the challenge resets at the player's local midnight, see `src/game/dateUtils.ts`) seeds an xmur3/mulberry32 PRNG. The same date always produces the identical challenge on the same game version; no `Math.random()`, no backend.
- **Variety**: nine venue tiers from an 800-seat club to a 100,000-seat college-football-scale stadium, fictional neutral names (Harbor Room, Meridian Arena, Ironwood Festival Grounds…), size-appropriate fictional event archetypes, and 1–2 **special modifiers** (bot surge, resale frenzy, fragile servers, viral demand, short notice) that all change real simulation inputs. Threat level and primary concern derive from the actual generated numbers.
- **Achievable by construction**: the target score is what the best of ten curated candidate configs *actually scores* on the generated level minus a margin (`balance.DAILY`), clamped to a sane band — so every day is beatable without being trivial. `daily.test.ts` validates hundreds of sampled dates for determinism, ranges, variety, and achievability.
- **Flow**: Mission Board card (venue, capacity, demand, primary threat, target, cleared state, today's best, streak) → Daily Briefing → the standard Configuration/Simulation/Results screens → Replay Today. Daily runs record **only** into `records.daily` — never into campaign mission records.
- **Records & streaks** (`records.ts`): per-day attempts/best/medal/completion + best config, plus current/longest streak and total days completed. A streak extends only on the *first* clear of consecutive local days; repeats never inflate it; a missed day shows as 0 via `effectiveDailyStreak`. Local-only — this is not a leaderboard, and players in different timezones may see different challenges at the same instant by design.

## Results — Cause & Effect Explanations

Every result metric answers *what it means, what caused it, and what to try next* (`src/game/explanations.ts`):

- **`analyzeMetricCauses(level, config, result)`** returns, per metric: a plain-language definition, ranked positive factors, ranked negative factors (each tied to an actual lever value the simulation uses — e.g. "Basic screening only stops 20% of bot traffic"), and one concrete recommendation. Factors are tagged with the lever they describe, and tests assert we never blame a control that doesn't affect that metric (e.g. Bots Blocked is moved *only* by Bot Detection and Verification).
- **`summarizeRun`** boils the run down to the biggest help, the biggest drag (excluding unfixable context like raw demand), and the single highest-impact change, weighted by the mission's metric weights.
- **UI**: each Results metric card is tappable (`aria-expanded`) and opens a detail panel — definition, "What helped", "What reduced the score", "Try next" — inside the **How Your Choices Affected This Run** section, which also shows the compact causal summary near the score.

## Onboarding — Training Shift

A first-time player is guided into an optional, forgiving **Training Shift** before the campaign:

- **Entry** (`src/screens/TrainingScreen.tsx`): on first-ever launch (no records, prompt unseen) the Title screen routes the player into training; returning players go straight to the Mission Board. A permanent Training Shift card also lives at the top of the Mission Board — marked **Recommended** until done, then a quiet **Replay** entry.
- **Guided step overlay**: a coach panel walks through one concept at a time — queue pressure, entry waves, bot defense, fairness, reading the live projections, and launching — over the *real* console primitives (`PressureHUD`, `QueueTraffic`, `GameSlider`, `SegmentedControl`, live projections) so the learning transfers directly to the campaign. Some steps offer a one-tap nudge (e.g. "Set Entry Waves to 3") to show the effect.
- **Forgiving**: uses a gentle `TRAINING_LEVEL` (`src/data/defaults.ts`) that isn't part of `LEVELS`, so it never affects campaign unlocks, records, or par maps. It ends in a friendly debrief and marks `trainingComplete` in the store. Skipping is always allowed.
- **Persistence**: `trainingComplete` / `trainingSeen` are additive optional flags on the v1 store — older saves load unchanged (a missing flag simply reads as "not done"), so no version bump was needed.

## Balance

Pars and rank bands are tuned for a smooth learning curve and reachable mastery, validated by an exhaustive config sweep (86,400 configs/level):

- **Pars rise across the campaign**: L1 58 → L2 61 → L3 62 → L4 63, with L5 a demanding 62 finale (compressed score ceiling from extreme demand). This replaced the old inverted ordering (65/65/65/60/55) where the "hardest" missions were the easiest to clear.
- **Rank bands** (`src/game/ranks.ts`): CLEAR = par, STRONG CLEAR = par + 6, MASTERED = par + 12 (was +10/+20). The tighter bands make **MASTERED reachable on every mission** — under the old scheme it was mathematically impossible everywhere.
- **Difficulty ramp**: sensible-player clear rates descend L1 → L5; mastery is achievable with a strong, thoughtful config on all five.

## Mission Personality & Campaign

Each of the five missions is a distinct operation, not a re-skinned level:

- **Mission identity** (`src/data/levels.ts` → `identity`): every mission has a threat level, a primary concern, a mission type, and a structured operations briefing (Situation / Threat Assessment / Operational Goal / Known Risks / Success Criteria). The Mission Board and Briefing surface these so each level reads differently.
- **Scenario modifiers** (`src/game/scenario.ts`): each mission owns exactly one deterministic pre-launch event (e.g. Arena "Unexpected traffic surge", Playoff "Scalper activity detected", Mega "Second bot wave detected"). `applyScenario(level)` adjusts the effective level parameters before the simulation and live projections run — no randomness, always the same modifier per level.
- **Level-specific debriefs**: the Results screen shows a scenario-tuned summary line per mission and outcome band (e.g. Festival "Public inventory was exhausted earlier than expected.").
- **Per-metric debrief** (`metricDiagnostics` in `src/game/recommendations.ts`): every metric that landed below its healthy band is explained with *what happened + which choice caused it + the concrete fix*, ordered worst-first by weighted shortfall. On a fail the debrief lists up to three ("What Held You Back"); on a clear it surfaces at most one ("Room to Improve"). This is config-aware — e.g. weak Stability from a single wave suggests staggering into 2–4 waves.
- **Campaign completion** (`deriveCampaignStatus`): once all five missions are cleared, a Campaign Complete screen shows Operator Rank, highest score, strong clears, mastered missions, total runs, and an overall rating, with Replay Campaign / Continue Improving Records options.
- **Audio hooks** (`src/game/audio.ts`): a no-op `playSound(event)` interface defines the gameplay sound events (`queue_open`, `warning`, `launch`, `pass`, `fail`, `strong_clear`, `mastered`, `button`, `slider`). No audio files ship yet — a real backend can be registered later via `setAudioSink` without touching call sites.
- **Urgency feedback**: server/bot HUD modules pulse under danger thresholds, the countdown shifts amber/red, and the Launch button intensifies when critical alerts are active. All motion respects `prefers-reduced-motion`.

## Local Records & Mastery

Queue Quest keeps a persistent progression layer entirely on the player's device — there is **no backend, no accounts, and no online leaderboard**.

- **Storage:** a single versioned LocalStorage key, `queueQuest.records.v1`.
- **Per mission** it stores: best score, best medal, highest fans served, highest stability, highest fairness, highest checkout, highest bots blocked, attempts, clears, mastered flag, and last-played time.
- **Global stats:** highest score, total simulations, total clears, total mastered, last played.
- **Mission Board** shows an *Operator Record* panel (highest score, missions cleared, missions mastered, total runs, last played) and, on every unlocked mission, a **Next Goal** that adapts to the player's current record (Clear → Strong Clear → Master → then push individual metrics or beat the best score).
- **Results screen** celebrates any new records (NEW BEST SCORE, NEW BEST FAIRNESS, MISSION MASTERED, …) and shows "No new records. Adjust your strategy and try again." when nothing improved.
- **Reset:** the Mission Board has a *Reset Local Records* control (with confirmation) that deletes only `queueQuest.records.v1` — nothing else.

The records layer degrades safely: missing data, corrupt JSON, and unknown future versions all recover to a fresh empty store rather than crashing. If LocalStorage is unavailable (private mode, blocked), the game still plays — records simply live in memory for the session.

### No online leaderboard / no backend

Queue Quest is a fully client-side static site. It never makes network calls for gameplay, has no server, no database, and no cloud save. All progression is local to the browser.

## Endless Shift

The long-term replay mode. **Unlocks after all five campaign missions are cleared** and appears as a distinct "Endless Shift" card on the Mission Board (never as "Level 6").

- **Deterministic escalation.** Every second is one tick. There is no randomness — waves, incidents, and pressure are all pure functions of the tick count (`src/game/endless.ts`). The same starting config always produces the same shift, so behaviour is fully testable.
- **Waves.** A new difficulty wave begins every 45 seconds. Base demand, bot pressure, server risk, and resale pressure ease upward each wave — a smooth ramp, never a spike.
- **Incidents.** From wave 2 onward, an incident starts every 20 seconds on a fixed rotation (Bot Swarm, Server Slowdown, VIP Rush, Public Sale Surge, Accessibility Spike, Payment Delay, Queue Restart). Each temporarily modifies the simulation and raises a short operational alert banner.
- **Live levers.** The player adjusts bot detection, verification, wave count, purchase limit, resale policy, presale, and accessibility *during* the shift to hold three survival meters: **Stability**, **Fairness**, and **Fan Patience**.
- **Combo.** A "good tick" (all meters holding or rising) builds combo; any bad tick resets it. Combo gently amplifies score (capped at +50%) — never enough to overpower good play.
- **Ending.** A shift ends when any meter hits zero (stability collapse, fairness collapse, or fans abandoning). The Shift Report shows time survived, waves, operator score, fans served, bots blocked, records broken, personal bests, and the next goal.
- **Records.** `records.endless` persists longest shift, highest score, highest combo, most fans served, best stability, best fairness, run count, and last played — surfaced on the Mission Board's Endless card. Reset Local Records clears these too (same single key).

Difficulty is designed so the player loses because pressure eventually overwhelms them — not because of an unfair event.

### Live Operational Decisions

To keep Endless active rather than passive, the shift periodically interrupts the operator with a **quick judgment call** (`src/game/decisions.ts`). Like everything else in Endless, it is fully deterministic — which decision appears and exactly when is a pure function of the tick count.

- **Cadence.** The first decision arrives at tick 75 (mid-wave-2), then one every `DECISION_PERIOD` (60s), cycling a fixed rotation of six scenarios: Server Load, Bot Attack, VIP Demand, Accessibility Spike, Payment Latency, Resale Abuse.
- **The card.** A decision card slides in as an amber operational alert with the prompt, the question, and a shrinking `DECISION_TIMEOUT` (10s) urgency bar. It offers exactly two options (YES / NO), each showing its tradeoffs against the three survival meters (e.g. *↓ Stability improves / ↑ Fan Patience worsens*).
- **Applying.** Clicking an option is immediate and pure (`applyDecision(state, 'yes' | 'no')`): it attaches a temporary modifier that lasts `EFFECT_DURATION` (25s) and the meters react on the next tick. Ignoring the card is always viable — it expires unanswered and the base simulation continues unchanged.
- **Tradeoffs, never a free lunch.** Every option improves one meter and worsens another. The **correct** call for each scenario is net-positive for survival; the **wrong** call is net-negative; ignoring sits between. This balance contract is verified both by a search over many configs (`correct ≥ ignore ≥ wrong` on average) and by regression tests.
- **Records.** Each shift tracks correct / wrong / ignored decisions and the longest correct streak. The Shift Report shows these plus a chronological **Major Decisions Taken** log (e.g. "Enabled aggressive verification", "Expanded accessibility allocation", "Rejected VIP expansion"). Aggregated across all shifts, `records.endless` also persists `totalDecisionsCorrect / Wrong / Ignored` and `bestCorrectStreak`, and the Mission Board's Operator Record surfaces an **Operational Accuracy %** (`correct / answered`, ignoring excluded).

## Tests

`src/game/simulation.test.ts` covers:

- Level target/par reconciliation (L1=58, L2=61, L3=62, L4=63, L5=62)
- Campaign difficulty ramp: pars rise L1→L4 and L5 is a hard finale
- Every level has a passing configuration
- Every level has a failing configuration
- Level 1 has ≥ 2 viable passing configs
- "Max everything" is not optimal for Level 1
- Bot detection tradeoff (higher detection → lower exposure, higher friction)
- Entry waves tradeoff (2–4 waves reduce load; excessive waves add stress)
- Presale allocation shrinks public inventory
- Face-value resale beats open resale on fairness in high-resale scenarios
- Verification friction ordering (ID > email)
- Metric ranges stay within valid bounds
- Rank thresholds match expected labels (CLEAR = par, STRONG = par+6, MASTERED = par+12)
- Per-metric diagnostics: weak metrics each yield a why + a concrete fix, ordered worst-first
- Warnings model has correct severity + priority sort

`src/game/records.test.ts` covers:

- Missing / corrupt / unknown-version storage recovery
- Saving a first result and attempt counting
- Better vs. worse score handling
- Better medal tier tracking and mastered flag
- Clear counting (passing runs only) and master counting
- Reset deletes only `queueQuest.records.v1`
- Next-goal generation across all progression stages
- Best-score / unlock restoration and save→load round-trip
- Campaign completion state and operator rank derivation
- Onboarding flags: backward-compatible load of older saves, flag round-trip, and `shouldPromptTraining` logic

`src/game/scenario.test.ts` covers:

- Every level has exactly one deterministic scenario modifier
- `applyScenario` is deterministic and clamps pressures to 0..1
- Each scenario shifts the intended effective parameters (Arena surge, Playoff scalpers, Mega second wave)
- Identity / weights / parScore / id survive the modifier
- All five levels still pass under their scenario with the documented strong config
- Mission identity metadata is complete, with escalating threat levels and distinct mission types / concerns

`src/game/endless.test.ts` covers:

- Determinism (same config → identical run) and step purity (input state never mutated)
- Wave schedule increments correctly; difficulty increases (later ticks drain a fixed config faster)
- Incident schedule: wave-1 grace period, fixed post-grace cadence, deterministic order, activation & expiry
- Shifts always end — no soft lock even for a strong config; strong config survives longer than weak
- Meters stay in 0..100, cumulative counters never decrease, highest combo tracks the peak
- Records: first run seeds, better run updates + flags improvements, worse run keeps bests, JSON round-trip

`src/game/decisions.test.ts` covers:

- Catalogue integrity: every decision has exactly two options, one correct, each with genuine (one-good/one-bad) tradeoffs
- Deterministic scheduling: no decisions during the grace period, fixed cadence, same tick → same decision
- Appearance & expiry: a decision activates on schedule; an ignored one expires after the timeout and is tallied as ignored
- Application: correct/wrong tally + history, no-op when nothing is active, purity (input state unchanged), modifiers change the sim and expire after `EFFECT_DURATION`
- Streak tracking, run-result decision fields, `applyEndlessResult` aggregation, and `operationalAccuracy` math
- Balance contract: correct decisions never survive less than wrong ones, correct ≥ ignoring, and correct beats wrong on average across many configs

`src/game/balance.test.ts` covers:

- Pinned headline values (rank bands, endless/decision cadence, key thresholds) — fails loudly on accidental drift, forces deliberate tuning
- Single-source-of-truth: `ranks.ts` / `endless.ts` / `decisions.ts` re-exports mirror `balance.ts` exactly

`src/game/analytics.test.ts` covers:

- No-op by default; delivers event + props + optional timestamp to a registered sink; never throws even if the sink throws; `clearAnalyticsSink` restores the no-op; event catalogue has no dupes

`src/game/devtools.test.ts` covers:

- Debug flag is safely disabled (never throws) in a non-browser environment
- QA seed utilities produce the intended progression state (campaign cleared / mastered / endless unlocked) and return fresh, non-shared stores

Migration (in `records.test.ts`): missing/non-numeric/future versions reset to a fresh store; a current-version save round-trips unchanged; `MIN_SUPPORTED_VERSION ≤ RECORDS_VERSION`; a campaign run never drops daily/endless/onboarding data (regression guard).

`src/game/daily.test.ts` covers:

- Determinism: the same date key always generates the identical challenge; different dates vary
- A 365-day sweep validates: capacity ∈ [800, 100 000], demand always exceeds capacity, pressures in range, no nonsensical venue/event combos, 1–2 modifiers that genuinely change sim inputs
- Achievability: every sampled day is clearable by at least one curated candidate config (targets never trivial — bounded by `balance.DAILY`)
- Daily records: attempts/best/completion roll over on date change; worse replays never lower the best; streaks extend only on consecutive-day first clears, never inflate on repeats, and reset after a missed day
- Date utils: local-midnight keys, invalid-date rejection, timezone-boundary consecutive-day logic

`src/game/explanations.test.ts` covers:

- Every metric has a definition, a value, and a recommendation
- Known configs produce expected causes: Enhanced detection helps Bots Blocked; aggressive verification hurts Satisfaction; 2–4 waves help Stability; excessive waves hurt it; high presale hurts Fairness; strong resale restrictions help Fairness under resale pressure
- Lever hygiene: explanations never blame a lever the sim doesn't use for that metric (e.g. Bots Blocked factors only reference detection/verification)
- Determinism: identical inputs produce identical explanations

`src/game/uiTour.test.ts` covers:

- Tour-flag parsing/recovery (corrupt, wrong-version, unknown ids), persistence round-trip, accumulation across tours, no-window safety, and key separation from game records

218 tests total, all passing.

## Accessibility

- Sliders are controlled inputs with `aria-valuemin`/`max`/`now` and visible focus rings.
- Segmented controls are ARIA radio groups with full keyboard navigation (Arrow keys / Home / End) and roving `tabIndex`.
- All animations are gated behind `@media (prefers-reduced-motion: no-preference)`.
- Color is never the sole indicator — icons + text labels accompany status states.
- Touch targets on sliders and segmented buttons are ≥ 44 px tall.
