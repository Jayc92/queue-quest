// Queue Quest — Endless Shift engine.
//
// A deterministic, tick-based survival simulation. One tick == one second of
// shift time. There is NO randomness: waves, incidents, and pressure are all
// pure functions of the tick count. The same starting config always produces
// the same shift, so behaviour is fully testable.
//
// Each tick:
//   1. Advance the wave/incident schedule from the tick number.
//   2. Compute current pressure (base + wave escalation + active incident).
//   3. Score the player's config against that pressure → per-tick deltas for
//      stability, fairness, and fan patience, plus fans served / bots blocked.
//   4. Update combo (good tick builds, bad tick resets) and operator score.
//   5. End the shift if any survival meter hits zero.

import type {
    EndlessConfig,
    EndlessState,
    IncidentDef,
    IncidentId,
    ActiveIncident,
    EndlessRunResult,
    DecisionModifier,
    DecisionTally,
    DecisionOutcome,
} from './types';
import { decisionStartingAt, findOption, DECISION_TIMEOUT } from './decisions';
import {
    ENDLESS,
    BOT_DETECTION_EFFECTIVENESS,
    BOT_DETECTION_FRICTION,
    VERIFICATION_EFFECTIVENESS,
    VERIFICATION_FRICTION,
    ENDLESS_RESALE_FAIRNESS as RESALE_FAIRNESS,
} from './balance';

// Tuning constants — values live in balance.ts (ENDLESS). Re-exported here so
// existing importers (tests, decisions.ts, screens) keep their entry point.
export const TICKS_PER_WAVE = ENDLESS.ticksPerWave;   // a new difficulty wave every 45s
export const INCIDENT_PERIOD = ENDLESS.incidentPeriod; // an incident begins every 20s (from wave 2)
export const MAX_SURVIVAL = ENDLESS.maxSurvival;

// Fixed incident rotation. Deterministic order; each recurs as the shift grows.
export const INCIDENTS: Record<IncidentId, IncidentDef> = {
    bot_swarm:            { id: 'bot_swarm',            label: 'Bot Swarm',            alert: 'Coordinated bot swarm hammering the waiting room.',   durationTicks: 12, botPressureAdd: 0.25, stabilityDrainAdd: 0.4 },
    server_slowdown:      { id: 'server_slowdown',      label: 'Server Slowdown',      alert: 'Datacenter degradation — response times climbing.',   durationTicks: 12, serverRiskAdd: 0.30, stabilityDrainAdd: 0.8 },
    vip_rush:             { id: 'vip_rush',             label: 'VIP Rush',             alert: 'VIP presale surge competing for inventory.',          durationTicks: 10, demandMult: 1.15, fairnessDrainAdd: 0.4 },
    public_surge:         { id: 'public_surge',         label: 'Public Sale Surge',    alert: 'General public flood — demand spiking hard.',         durationTicks: 12, demandMult: 1.25, stabilityDrainAdd: 0.5 },
    accessibility_spike:  { id: 'accessibility_spike',  label: 'Accessibility Spike',  alert: 'Accessibility lane overwhelmed — coverage at risk.',  durationTicks: 10, fairnessDrainAdd: 0.7 },
    payment_delay:        { id: 'payment_delay',        label: 'Payment Delay',        alert: 'Payment processor latency — checkouts stalling.',     durationTicks: 10, stabilityDrainAdd: 0.5, fairnessDrainAdd: 0.2 },
    queue_restart:        { id: 'queue_restart',        label: 'Queue Restart',        alert: 'Emergency queue restart — fans losing patience.',     durationTicks: 8,  stabilityDrainAdd: 0.6, fairnessDrainAdd: 0.3 },
};

// Deterministic incident order, cycled as the shift progresses.
const INCIDENT_ORDER: IncidentId[] = [
    'public_surge', 'bot_swarm', 'vip_rush', 'server_slowdown',
    'accessibility_spike', 'payment_delay', 'bot_swarm', 'queue_restart',
];

function emptyTally(): DecisionTally {
    return { correct: 0, wrong: 0, ignored: 0, longestCorrectStreak: 0, currentCorrectStreak: 0 };
}

export function createEndlessState(): EndlessState {
    return {
        tick: 0,
        wave: 1,
        stability: MAX_SURVIVAL,
        fairness: MAX_SURVIVAL,
        fanPatience: MAX_SURVIVAL,
        combo: 0,
        highestCombo: 0,
        fansServed: 0,
        botsBlocked: 0,
        operatorScore: 0,
        activeIncident: null,
        activeDecision: null,
        modifiers: [],
        tally: emptyTally(),
        history: [],
        over: false,
        endReason: null,
    };
}

// Apply the player's answer to the currently-active decision. Pure: returns a
// new state. `optionId` of 'yes'/'no' takes that option; the modifier is added
// and the outcome recorded. Called from the UI; deterministic given inputs.
export function applyDecision(state: EndlessState, optionId: 'yes' | 'no'): EndlessState {
    if (state.over || !state.activeDecision) return state;
    const def = state.activeDecision.def;
    const option = findOption(def, optionId);

    const modifier: DecisionModifier = {
        sourceId: def.id,
        ticksRemaining: option.durationTicks,
        botBlockAdd: option.botBlockAdd ?? 0,
        frictionAdd: option.frictionAdd ?? 0,
        stabilityDrainAdd: option.stabilityDrainAdd ?? 0,
        fairnessDrainAdd: option.fairnessDrainAdd ?? 0,
        patienceDrainAdd: option.patienceDrainAdd ?? 0,
    };

    const kind: DecisionOutcome['kind'] = option.correct ? 'correct' : 'wrong';
    const tally = updateTally(state.tally, kind);
    const history: DecisionOutcome[] = [
        ...state.history,
        { decisionId: def.id, historyLabel: option.historyLabel, kind, tick: state.tick },
    ];

    return {
        ...state,
        activeDecision: null,
        modifiers: [...state.modifiers, modifier],
        tally,
        history,
    };
}

function updateTally(prev: DecisionTally, kind: DecisionOutcome['kind']): DecisionTally {
    const correct = prev.correct + (kind === 'correct' ? 1 : 0);
    const wrong = prev.wrong + (kind === 'wrong' ? 1 : 0);
    const ignored = prev.ignored + (kind === 'ignored' ? 1 : 0);
    const currentCorrectStreak = kind === 'correct' ? prev.currentCorrectStreak + 1 : 0;
    const longestCorrectStreak = Math.max(prev.longestCorrectStreak, currentCorrectStreak);
    return { correct, wrong, ignored, longestCorrectStreak, currentCorrectStreak };
}

export function waveForTick(tick: number): number {
    return Math.floor(tick / TICKS_PER_WAVE) + 1;
}

// Which incident (if any) begins on this exact tick. Deterministic schedule:
// wave 1 is a calm grace period; from its end, an incident starts every
// INCIDENT_PERIOD ticks, cycling through a fixed order.
export function incidentStartingAt(tick: number): IncidentDef | null {
    const sinceGrace = tick - TICKS_PER_WAVE;
    if (sinceGrace < 0) return null;                    // grace period: wave 1 is calm
    if (sinceGrace % INCIDENT_PERIOD !== 0) return null;
    const index = sinceGrace / INCIDENT_PERIOD;
    const id = INCIDENT_ORDER[index % INCIDENT_ORDER.length];
    return INCIDENTS[id];
}

// Base pressure grows smoothly with the wave number (no spikes). Tuning: ENDLESS.
function basePressure(wave: number) {
    // Demand-to-capacity style ratio that eases upward.
    const demandFactor = 1 + (wave - 1) * ENDLESS.demandFactorPerWave;   // 1.0, 1.35, 1.7, ...
    const botPressure = Math.min(ENDLESS.botPressureCap, ENDLESS.botPressureBase + (wave - 1) * ENDLESS.botPressurePerWave);
    const serverRisk = Math.min(ENDLESS.serverRiskCap, ENDLESS.serverRiskBase + (wave - 1) * ENDLESS.serverRiskPerWave);
    const resalePressure = Math.min(ENDLESS.resalePressureCap, ENDLESS.resalePressureBase + (wave - 1) * ENDLESS.resalePressurePerWave);
    return { demandFactor, botPressure, serverRisk, resalePressure };
}

// Optional per-step overrides. These exist ONLY for the developer debug panel;
// omitting `opts` (the default) preserves the exact production behaviour, so all
// gameplay and tests are unaffected.
export interface StepOptions {
    /** Dev QA: skip starting/continuing incidents this tick (no incident modifiers). */
    suppressIncidents?: boolean;
}

// Advance the simulation by exactly one tick. Pure: returns a new state.
export function stepEndless(state: EndlessState, config: EndlessConfig, opts?: StepOptions): EndlessState {
    if (state.over) return state;

    const tick = state.tick + 1;
    const wave = waveForTick(tick);

    // --- Incident lifecycle ---
    let active: ActiveIncident | null = state.activeIncident
        ? { ...state.activeIncident, ticksRemaining: state.activeIncident.ticksRemaining - 1 }
        : null;
    if (active && active.ticksRemaining <= 0) active = null;

    const starting = opts?.suppressIncidents ? null : incidentStartingAt(tick);
    if (starting) {
        active = { id: starting.id, label: starting.label, alert: starting.alert, ticksRemaining: starting.durationTicks };
    }
    // When suppressing incidents (dev only), also drop any already-active one so no
    // incident modifiers apply this tick.
    if (opts?.suppressIncidents) active = null;
    const incidentDef = active ? INCIDENTS[active.id] : null;

    // --- Decision lifecycle ---
    // Age active decision modifiers; drop the expired ones.
    let modifiers: DecisionModifier[] = state.modifiers
        .map(m => ({ ...m, ticksRemaining: m.ticksRemaining - 1 }))
        .filter(m => m.ticksRemaining > 0);

    // Age the on-screen decision; if it expires unanswered it counts as ignored.
    let activeDecision = state.activeDecision
        ? { ...state.activeDecision, ticksRemaining: state.activeDecision.ticksRemaining - 1 }
        : null;
    let tally = state.tally;
    let history = state.history;
    if (activeDecision && activeDecision.ticksRemaining <= 0) {
        tally = updateTally(tally, 'ignored');
        history = [...history, { decisionId: activeDecision.def.id, historyLabel: 'Ignored decision', kind: 'ignored', tick }];
        activeDecision = null;
    }

    // Offer a new decision on schedule (only if none is currently on screen).
    if (!activeDecision) {
        const offered = decisionStartingAt(tick);
        if (offered) activeDecision = { def: offered, ticksRemaining: DECISION_TIMEOUT };
    }

    // Sum active decision modifiers.
    const modBotBlock = modifiers.reduce((s, m) => s + m.botBlockAdd, 0);
    const modFriction = modifiers.reduce((s, m) => s + m.frictionAdd, 0);
    const modStabilityDrain = modifiers.reduce((s, m) => s + m.stabilityDrainAdd, 0);
    const modFairnessDrain = modifiers.reduce((s, m) => s + m.fairnessDrainAdd, 0);
    const modPatienceDrain = modifiers.reduce((s, m) => s + m.patienceDrainAdd, 0);

    // --- Effective pressure this tick ---
    const base = basePressure(wave);
    const botPressure = Math.min(1, base.botPressure + (incidentDef?.botPressureAdd ?? 0));
    const serverRisk = Math.min(1, base.serverRisk + (incidentDef?.serverRiskAdd ?? 0));
    const resalePressure = Math.min(1, base.resalePressure + (incidentDef?.resalePressureAdd ?? 0));
    const demandFactor = base.demandFactor * (incidentDef?.demandMult ?? 1);

    // --- Player defenses from config (plus live decision modifiers) ---
    const botBlock = Math.min(ENDLESS.maxBotBlock,
        BOT_DETECTION_EFFECTIVENESS[config.botDetection] + VERIFICATION_EFFECTIVENESS[config.verification] * ENDLESS.verificationBlockScale + modBotBlock);
    const friction = BOT_DETECTION_FRICTION[config.botDetection] + VERIFICATION_FRICTION[config.verification] + modFriction;
    const waveRelief = config.waveCount > 1 ? Math.min(ENDLESS.waveReliefCap, (config.waveCount - 1) * ENDLESS.waveReliefPerWave) : 0;
    const excessWaves = Math.max(0, config.waveCount - ENDLESS.excessWaveKnee) * ENDLESS.excessWavePerWave;
    const presaleRelief = config.presalePercent * ENDLESS.presaleReliefPerPct;
    const accessCoverage = config.accessiblePercent / ENDLESS.accessCoverageDivisor;   // 0..1
    const purchaseFairness = (8 - config.purchaseLimit) / 7; // tighter = fairer, 0..1
    const resaleFairness = RESALE_FAIRNESS[config.resale];

    // --- Per-tick meter deltas ---
    // Stability: server pressure vs. wave staggering & presale relief.
    // Decision `stabilityDrainAdd` is a drain (positive worsens, negative relieves).
    const unmetLoad = Math.max(0, serverRisk * demandFactor - waveRelief - presaleRelief + excessWaves);
    let stabilityDelta = ENDLESS.stabilityBaseDelta - unmetLoad * ENDLESS.unmetLoadStabilityWeight - (incidentDef?.stabilityDrainAdd ?? 0) - modStabilityDrain;

    // Fairness: bot blocking + resale policy + accessibility + purchase limits vs. resale pressure.
    const fairnessSupport = botBlock * ENDLESS.fairnessSupportBotWeight + resaleFairness * ENDLESS.fairnessSupportResaleWeight
        + accessCoverage * ENDLESS.fairnessSupportAccessWeight + purchaseFairness * ENDLESS.fairnessSupportPurchaseWeight;
    const fairnessThreat = resalePressure * ENDLESS.fairnessThreatResaleWeight + (1 - botBlock) * ENDLESS.fairnessThreatBotWeight;
    let fairnessDelta = ENDLESS.fairnessBaseDelta + (fairnessSupport - fairnessThreat) - (incidentDef?.fairnessDrainAdd ?? 0) - modFairnessDrain;

    // Fan patience: friction and instability erode it; smooth flow restores it.
    let patienceDelta = ENDLESS.patienceBaseDelta - friction * ENDLESS.patienceFrictionWeight - Math.max(0, unmetLoad) * ENDLESS.patienceUnmetLoadWeight - modPatienceDrain;
    if (state.stability < ENDLESS.patienceStabilityPanicKnee) patienceDelta -= ENDLESS.patienceStabilityPanicDrain;      // a collapsing site frustrates fans

    // Clamp per-tick deltas so nothing swings wildly (smooth difficulty).
    stabilityDelta = clampDelta(stabilityDelta);
    fairnessDelta = clampDelta(fairnessDelta);
    patienceDelta = clampDelta(patienceDelta);

    const stability = clampMeter(state.stability + stabilityDelta);
    const fairness = clampMeter(state.fairness + fairnessDelta);
    const fanPatience = clampMeter(state.fanPatience + patienceDelta);

    // --- Throughput this tick ---
    const realFanFlow = Math.max(0, (1 - friction) * (stability / 100) * demandFactor * ENDLESS.fanFlowScale);
    const fansServed = state.fansServed + Math.round(realFanFlow);
    const botsThisTick = Math.round(botPressure * demandFactor * ENDLESS.botFlowScale * botBlock);
    const botsBlocked = state.botsBlocked + botsThisTick;

    // --- Combo: a "good tick" holds all meters healthy. ---
    const goodTick = stabilityDelta >= 0 && fairnessDelta >= 0 && patienceDelta >= 0;
    const combo = goodTick ? state.combo + 1 : 0;
    const highestCombo = Math.max(state.highestCombo, combo);

    // --- Operator score: throughput + survival, gently amplified by combo. ---
    const comboMult = 1 + Math.min(ENDLESS.comboMultCap, combo * ENDLESS.comboMultPerCombo);   // capped at +50%
    const tickScore = (realFanFlow * ENDLESS.scoreFanWeight + botsThisTick * ENDLESS.scoreBotWeight + wave * ENDLESS.scoreWaveWeight) * comboMult;
    const operatorScore = state.operatorScore + Math.round(tickScore);

    // --- End conditions ---
    let over = false;
    let endReason: EndlessState['endReason'] = null;
    if (stability <= 0) { over = true; endReason = 'stability'; }
    else if (fairness <= 0) { over = true; endReason = 'fairness'; }
    else if (fanPatience <= 0) { over = true; endReason = 'patience'; }

    return {
        tick, wave, stability, fairness, fanPatience,
        combo, highestCombo, fansServed, botsBlocked, operatorScore,
        activeIncident: active,
        activeDecision, modifiers, tally, history,
        over, endReason,
    };
}

function clampMeter(v: number): number {
    return Math.max(0, Math.min(MAX_SURVIVAL, v));
}
// Keep per-tick change gentle so difficulty ramps rather than spikes.
function clampDelta(v: number): number {
    return Math.max(ENDLESS.deltaClampMin, Math.min(ENDLESS.deltaClampMax, v));
}

// Convenience: run a full shift to its end with a fixed config (used by tests
// and by the difficulty guarantees). Cap prevents an infinite loop if a config
// were ever unbeatable-in-reverse (it never is — pressure always wins).
export function simulateEndlessRun(config: EndlessConfig, maxTicks = 100000): EndlessRunResult {
    let state = createEndlessState();
    while (!state.over && state.tick < maxTicks) {
        state = stepEndless(state, config);
    }
    return endlessResultFromState(state);
}

export function endlessResultFromState(state: EndlessState): EndlessRunResult {
    return {
        timeSurvived: state.tick,
        wavesReached: state.wave,
        fansServed: state.fansServed,
        botsBlocked: state.botsBlocked,
        highestCombo: state.highestCombo,
        stability: Math.round(state.stability),
        fairness: Math.round(state.fairness),
        operatorScore: state.operatorScore,
        endReason: state.endReason ?? 'stability',
        decisionsCorrect: state.tally.correct,
        decisionsWrong: state.tally.wrong,
        decisionsIgnored: state.tally.ignored,
        longestCorrectStreak: state.tally.longestCorrectStreak,
        history: state.history,
    };
}
