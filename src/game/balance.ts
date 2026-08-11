// Queue Quest — Central Balance Configuration.
//
// SINGLE SOURCE OF TRUTH for every gameplay tuning constant. After outside
// playtesting, tune values HERE — the rest of the codebase reads from this
// module, so no gameplay number should live as a magic literal elsewhere.
//
// Rules of the road:
//   * Every value is documented with what it does and which direction is "harder".
//   * Nothing here changes behaviour on its own; modules import these and apply
//     them exactly as before. This file exists purely to make tuning safe & fast.
//   * The pure simulation stays deterministic — none of these introduce randomness.
//
// Layout: CAMPAIGN (single-run sim + scoring) → ENDLESS (survival sim) →
// DECISIONS (live judgment calls) → UI (projection/alert thresholds, timings).

import type { BotDetection, Verification, ResalePolicy } from './types';

// ============================================================
// RANKS — how a score maps to a medal, relative to a mission's par.
// Bands: FAILED < par+FAIL ≤ NEAR MISS < par ≤ CLEAR < par+STRONG ≤ STRONG < par+MASTER ≤ MASTERED
// Tightened from +10/+20 so MASTERED is reachable on every mission (see ranks.ts history).
// ============================================================
export const RANK = {
    /** A score this far below par is an outright FAIL (vs. a NEAR MISS just under par). */
    failDelta: -12,
    /** par + this = STRONG CLEAR band opens. */
    strongClearDelta: 6,
    /** par + this = MASTERED band opens. */
    masterDelta: 12,
} as const;

// ============================================================
// SHARED LEVER EFFECTIVENESS TABLES
// Used by both the campaign simulation and live projections. Higher detection /
// verification = more bots blocked but more fan friction (the core tradeoff).
// ============================================================

/** Fraction of bot traffic each detection tier blocks on its own (0–1). */
export const BOT_DETECTION_EFFECTIVENESS: Record<BotDetection, number> = {
    low: 0.20, medium: 0.50, high: 0.78, aggressive: 0.94,
};
/** Fan-facing friction each detection tier adds (0–1); erodes satisfaction/throughput. */
export const BOT_DETECTION_FRICTION: Record<BotDetection, number> = {
    low: 0.02, medium: 0.06, high: 0.14, aggressive: 0.30,
};
/** Extra bot blocking contributed by verification (scaled where used). */
export const VERIFICATION_EFFECTIVENESS: Record<Verification, number> = {
    none: 0, basic: 0.25, verified: 0.75,
};
/** Fan-facing friction each verification tier adds (0–1). */
export const VERIFICATION_FRICTION: Record<Verification, number> = {
    none: 0, basic: 0.04, verified: 0.18,
};

// ============================================================
// CAMPAIGN SIMULATION (src/game/simulation.ts)
// One-shot scoring of a configured onsale. All additive/multiplicative weights
// that shape the six metrics live here.
// ============================================================
export const SIM = {
    /** Combined bot-block is capped so nothing is ever 100% bulletproof. */
    maxBotBlock: 0.98,
    /** Verification's contribution to bot blocking is scaled by this before adding. */
    verificationBlockScale: 0.3,
    /** Average tickets a bot grabs, as a fraction of the purchase limit (min 1). */
    avgBotTicketFactor: 0.8,
    /** Bot tickets can never exceed this fraction of seats (clamp). */
    botTicketSeatCap: 0.4,
    /** Per-hour waiting-room bonus to bot preparation (longer room = more bot prep). */
    botPrepPerHour: 0.03,
    /** L4 short-notice: per-hour extra bot advantage above 2h waiting room. */
    shortNoticeBotPerHour: 0.02,

    // --- Server load / stability ---
    /** Waves above this count start adding stress instead of relieving load. */
    waveReliefKnee: 4,
    /** Per-wave load reduction below the knee. */
    waveReliefPerWave: 0.16,
    /** Per-wave load penalty above the knee. */
    waveExcessPenaltyPerWave: 0.18,
    /** Floor on the wave load multiplier (waves can't zero out load). */
    waveLoadFloor: 0.35,
    /** Per-minute interval load reduction, capped. */
    intervalReductionPerMin: 0.003,
    intervalReductionCap: 0.12,
    /** Per-% presale load reduction (presale sheds public-sale load). */
    presaleLoadReductionPerPct: 0.005,
    /** Scenario server risk is amplified by this into load. */
    serverScenarioLoadMult: 1.5,
    baseLoadMult: 1.7,
    loadScale: 9,
    /** Stability = this − load·slope − penalties, clamped to [floor, 100]. */
    stabilityBase: 128,
    stabilityLoadSlope: 0.72,
    stabilityFloor: 20,
    /** Waves beyond 5 each subtract this from stability. */
    excessWaveStabilityPenalty: 6,
    /** Waiting room beyond 12h subtracts this per hour from stability. */
    longWaitStabilityPenaltyPerHour: 0.8,

    // --- Checkout ---
    checkoutMin: 40,
    checkoutMax: 98,
    checkoutStabilityWeight: 0.6,
    checkoutFrictionWeight: 0.4,
    /** More than 4 waves shaves a few points off checkout. */
    checkoutManyWavesPenalty: 3,

    // --- Satisfaction (starts at base, adjusted by config) ---
    satisfactionBase: 62,
    satFansWeight: 30,
    satCheckoutWeight: 0.3,
    satAccessiblePerPct: 0.6,
    satWaveBonus: 10,           // 2–4 waves feel smooth
    satFrictionWeight: 40,
    satInstabilityWeight: 0.3,
    satLongWaitPerHour: 2,      // above 4h
    satVerifiedPenalty: 4,
    satMin: 20, satMax: 100,

    // --- Fairness ---
    fairnessBase: 58,
    fairFansWeight: 20,
    fairBotsBlockedWeight: 15,
    fairAccessiblePerPct: 1.2,
    fairPresaleKnee: 30,        // presale above this hurts fairness
    fairPresalePenalty1: 0.6,
    fairPresaleKnee2: 40,
    fairPresalePenalty2: 0.8,
    fairVerificationWeight: 10,
    fairPurchaseLimitWeight: 2, // (8 − limit) × weight; tighter = fairer
    fairFestivalAccessBonus: 0.5,
    fairMin: 20, fairMax: 100,
} as const;

/** Resale policy → satisfaction delta (open resale annoys, face value pleases). */
export const RESALE_SATISFACTION: Record<ResalePolicy, number> = { none: -6, caps: 4, face: 10, no_resale: -2 };
/** Resale policy → fairness delta. */
export const RESALE_FAIRNESS: Record<ResalePolicy, number> = { none: -12, caps: 4, face: 12, no_resale: 8 };
/** Fairness delta applied additionally when resale pressure is high (>0.7). */
export const RESALE_FAIRNESS_HIGH_PRESSURE: Record<ResalePolicy, number> = { none: -6, caps: 2, face: 5, no_resale: 4 };
/** L4 Playoff-specific satisfaction nudge per resale policy. */
export const RESALE_SATISFACTION_PLAYOFF: Record<ResalePolicy, number> = { none: -6, caps: 2, face: 6, no_resale: 0 };

// ============================================================
// LIVE PROJECTIONS (src/game/projections.ts)
// Pre-launch forecast shown on the Configuration console. These are the
// thresholds that color the risk meters and raise pre-launch alerts.
// ============================================================
export const PROJECTION = {
    /** Load-risk model coefficients (mirror of the sim's load model, scaled for display). */
    loadBaseMult: 1.7,
    loadServerRiskWeight: 15,
    loadScale: 4,
    /** Fairness estimate uses the same weights as the sim (kept in sync via SIM where possible). */
} as const;

/** Pre-launch ALERT trigger thresholds. Tuning these changes when warnings fire. */
export const ALERT = {
    botExposureHigh: 55,       // danger: too many bots getting through
    fanFrictionCritical: 30,   // danger: friction likely to block real fans
    fanFrictionRising: 20,     // warning band (20–30)
    singleWaveBaseLoad: 4,     // danger: 1 wave + demand/seats above this
    publicPoolThin: 55,        // warning: public inventory % below this
    presaleOverAllocated: 35,  // warning: presale % above this
    accessibilityLow: 2,       // warning: accessible % at or below this
    longLeadHours: 6,          // warning (L4): waiting room above this
    tooManyWaves: 5,           // warning: wave count above this
    waitingRoomTooLong: 12,    // warning: bots get more prep above this
} as const;

/** Risk-meter color thresholds on the Configuration console (low = good edge, high = danger edge). */
export const RISK_METER = {
    botExposure: { low: 25, high: 55 },
    fanFriction: { low: 12, high: 30 },
    loadRisk: { low: 35, high: 65 },
    fairness: { low: 45, high: 70 },        // inverted meter (higher is better)
    presalePressure: { low: 30, high: 65 },
    accessibility: { low: 25, high: 55 },   // inverted meter
} as const;

// ============================================================
// ENDLESS SHIFT (src/game/endless.ts)
// Deterministic survival sim. One tick == one shift-second.
// ============================================================
export const ENDLESS = {
    /** A new difficulty wave begins every N seconds. */
    ticksPerWave: 45,
    /** From wave 2 on, an incident starts every N seconds. */
    incidentPeriod: 20,
    /** Survival meters run 0–100; a shift ends when any hits 0. */
    maxSurvival: 100,

    // --- Base pressure growth per wave (smooth ramp, no spikes) ---
    /** Demand factor grows linearly: 1 + (wave−1)·step. */
    demandFactorPerWave: 0.35,
    botPressureBase: 0.15, botPressurePerWave: 0.08, botPressureCap: 0.9,
    serverRiskBase: 0.15, serverRiskPerWave: 0.09, serverRiskCap: 0.9,
    resalePressureBase: 0.20, resalePressurePerWave: 0.07, resalePressureCap: 0.9,

    // --- Player defense mapping (endless reuses campaign tables + these) ---
    maxBotBlock: 0.98,
    verificationBlockScale: 0.3,
    waveReliefPerWave: 0.12, waveReliefCap: 0.5,
    excessWaveKnee: 5, excessWavePerWave: 0.06,
    presaleReliefPerPct: 0.004,
    accessCoverageDivisor: 15,   // accessiblePercent / this → 0..1 coverage

    // --- Per-tick meter deltas (positive = recover, negative = drain) ---
    stabilityBaseDelta: 1.2,
    unmetLoadStabilityWeight: 5,
    fairnessBaseDelta: 0.9,
    fairnessSupportBotWeight: 1.2,
    fairnessSupportResaleWeight: 4,
    fairnessSupportAccessWeight: 1.2,
    fairnessSupportPurchaseWeight: 1.2,
    fairnessThreatResaleWeight: 2.2,
    fairnessThreatBotWeight: 1.5,
    patienceBaseDelta: 1.0,
    patienceFrictionWeight: 6,
    patienceUnmetLoadWeight: 3,
    /** Below this stability, fans lose extra patience (collapsing site frustrates). */
    patienceStabilityPanicKnee: 40,
    patienceStabilityPanicDrain: 0.8,

    /** Per-tick delta clamp so difficulty ramps smoothly rather than spiking. */
    deltaClampMin: -3.5, deltaClampMax: 2,

    // --- Throughput & score ---
    fanFlowScale: 40,
    botFlowScale: 30,
    scoreFanWeight: 0.5,
    scoreBotWeight: 0.3,
    scoreWaveWeight: 2,
    /** Combo amplifies score up to +comboMultCap, at comboMultPerCombo per point. */
    comboMultPerCombo: 0.01,
    comboMultCap: 0.5,
} as const;

/** Endless resale-policy fairness contribution (per-tick scale, distinct from campaign). */
export const ENDLESS_RESALE_FAIRNESS: Record<ResalePolicy, number> = { none: -0.12, caps: 0.04, face: 0.12, no_resale: 0.08 };

// ============================================================
// LIVE DECISIONS (src/game/decisions.ts)
// Mid-shift judgment calls. Deterministic scheduling.
// ============================================================
export const DECISION = {
    /** A decision is offered every N seconds… */
    period: 60,
    /** …starting this many seconds after the wave-1 grace period ends (→ first at tick 75). */
    firstOffset: 30,
    /** Seconds a decision stays on screen before it counts as "ignored". */
    timeout: 10,
    /** Seconds a taken decision's modifier stays active on the sim. */
    effectDuration: 25,
} as const;

// ============================================================
// DAILY CHALLENGE (src/game/daily.ts)
// Deterministic seeded generation from the local calendar date.
// ============================================================
export const DAILY = {
    /**
     * The target score is derived from what the strongest candidate config
     * actually scores on the generated level, minus this margin — so every
     * challenge is achievable BY CONSTRUCTION without being trivial.
     */
    targetMargin: 6,
    /** Target score clamp: never below (too trivial) / above (too punishing). */
    targetMin: 50,
    targetMax: 74,
    /** Base demand-to-seat ratio range (viral days go above this, labeled). */
    ratioMin: 4,
    ratioMax: 20,
    /** Viral-demand modifier pushes the ratio into this labeled anomaly band. */
    viralRatioMin: 25,
    viralRatioMax: 40,
} as const;

// ============================================================
// UI TIMINGS (screens) — countdown speeds & reveal delays.
// Player-visible pacing that isn't part of the deterministic sim.
// ============================================================
export const UI = {
    /** Endless shift tick length (ms). One real second per shift-second. */
    endlessTickMs: 1000,
    /** Config-console "doors open" countdown seconds (loops for ambiance). */
    pressureCountdownStart: 180,
    /** Simulation launch sequence: ms per phase (reduced-motion snaps faster). */
    simPhaseMs: 300,
    simPhaseReducedMs: 40,
    /** Results screen: delay before the detailed panels reveal (reduced-motion shortens). */
    resultsRevealMs: 500,
    resultsRevealReducedMs: 50,
    /** Count-up animation duration for result/record numbers (ms). */
    countUpMs: 700,
} as const;
