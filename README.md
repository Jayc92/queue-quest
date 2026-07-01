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
├── data/            # levels.ts, defaults.ts
├── game/            # pure logic — types.ts, simulation.ts, projections.ts, recommendations.ts, ranks.ts
├── components/
│   ├── ui/          # Icon, GameSlider, SegmentedControl, primitives (StatusChip, RiskMeter, ConsolePanel, WarningPill, WarningAlert, MedalBadge)
│   └── game/        # PressureHUD, QueueTraffic
├── screens/         # TitleScreen, LevelSelectScreen, BriefingScreen, ConfigurationScreen, SimulationScreen, ResultsScreen
├── App.tsx          # screen state machine
├── main.tsx         # entry
└── styles.css       # production CSS design system
```

## Gameplay Rules

- 5 progressive levels: Small Venue → Arena → Festival → Playoff → Mega Artist Tour.
- 8 lever categories, 9 controls (Entry Waves has count + interval).
- Best scores are tracked **in memory only**. No localStorage, no backend.
- No real brands, artists, teams, or venues are used.

## Tests

Vitest suite in `src/game/simulation.test.ts` covers:

- Level target/par reconciliation (L1=65, L2=65, L3=65, L4=60, L5=55)
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
- Rank thresholds match expected labels
- Warnings model has correct severity + priority sort

38 tests, all passing.

## Accessibility

- Sliders are controlled inputs with `aria-valuemin`/`max`/`now` and visible focus rings.
- Segmented controls are ARIA radio groups with full keyboard navigation (Arrow keys / Home / End) and roving `tabIndex`.
- All animations are gated behind `@media (prefers-reduced-motion: no-preference)`.
- Color is never the sole indicator — icons + text labels accompany status states.
- Touch targets on sliders and segmented buttons are ≥ 44 px tall.
