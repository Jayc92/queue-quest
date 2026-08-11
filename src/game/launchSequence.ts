// Queue Quest — Launch Onsale anticipation sequence (presentation model).
//
// When the player hits LAUNCH ONSALE, the deterministic simulation result has
// already been computed. This module turns that result into a short, escalating
// "live onsale" visualization plan: which phases play, for how long, and what
// every meter/counter/warning should show. It is a PURE function of the actual
// run — never a second simulation, never random decoration, and it never lies:
// a controlled run looks controlled, a struggling run visibly struggles.
//
// Deliberately excluded: the final overall score. The player stays uncertain
// until the Results reveal (tests pin this).

import type { Level, GameConfig, ProjectionResult, SimulationResult } from './types';

export type LaunchPhaseId = 'live' | 'surge' | 'botfilter' | 'waves' | 'checkout' | 'finalize';
export type LaunchTone = 'good' | 'warning' | 'danger';

export interface LaunchPhase {
    id: LaunchPhaseId;
    label: string;       // "REQUEST SURGE"
    detail: string;      // escalating, run-aware operational copy
    durationMs: number;
    tone: 'cyan' | 'amber' | 'red' | 'green';
}

export interface LaunchVisualModel {
    // Context (drives scale/copy — Daily venues flow through level automatically)
    venueName: string;
    seats: number;
    demand: number;
    demandDisplay: string;                       // "184,000"
    requestTier: 'small' | 'mid' | 'massive';    // packet density / copy intensity

    // Bot filter node (from the ACTUAL result)
    botBlockedPct: number;
    botLeaked: boolean;                          // leak warning fires below the healthy band
    botTone: LaunchTone;

    // Server node
    serverLoadPct: number;
    serverTone: LaunchTone;
    serverCritical: boolean;                     // shake/critical copy ONLY when truly unstable

    // Wave release behaviour
    waveCount: number;
    waveStyle: 'single-surge' | 'organized' | 'strained';

    // Checkout node
    frictionPct: number;
    frictionSlow: boolean;
    checkoutPct: number;
    checkoutStruggling: boolean;

    // Allocation
    fairnessImbalance: boolean;

    // Inventory countdown (seats sold to fans + bots; not the score)
    ticketsStart: number;
    ticketsEnd: number;

    phases: LaunchPhase[];
    totalMs: number;
}

// Tension-curve timing (ms). Total ≈ 4s: long enough for anticipation, short
// enough that repeat runs stay tolerable (a Skip appears after the first second).
export const LAUNCH_TIMING: Record<LaunchPhaseId, number> = {
    live: 500,
    surge: 700,
    botfilter: 800,
    waves: 800,
    checkout: 700,
    finalize: 500,
};

/** Reduced-motion runs compress every phase by this factor (states are kept). */
export const LAUNCH_REDUCED_SCALE = 0.3;
/** The Skip affordance appears after this much of the sequence has played. */
export const LAUNCH_SKIP_AFTER_MS = 1000;

// Visual thresholds — aligned with the Results screen's metric bands, the
// simulation trace tones, and the config console's risk meters so the launch
// preview never contradicts anything the player has seen or will see.
const BOT_GOOD = 70, BOT_WARN = 50;          // botsBlockedPct bands
const LOAD_HOT = 65, LOAD_WARM = 35;         // loadRisk bands (RISK_METER.loadRisk)
export const STABILITY_CRITICAL = 45;        // below → genuine "LOAD CRITICAL"
const CHECKOUT_STRUGGLE = 65;                // trace's checkout-bottleneck threshold
const FRICTION_SLOW = 20;                    // ALERT.fanFrictionRising
const FAIRNESS_IMBALANCE = 50;               // metric card danger band

export function buildLaunchSequence(
    level: Level,
    config: GameConfig,
    projections: ProjectionResult,
    result: SimulationResult,
): LaunchVisualModel {
    const demand = level.demand;
    const requestTier: LaunchVisualModel['requestTier'] =
        demand >= 1_000_000 ? 'massive' : demand >= 100_000 ? 'mid' : 'small';
    const demandDisplay = demand.toLocaleString('en-US');

    const botBlockedPct = result.botsBlockedPct;
    const botLeaked = botBlockedPct < BOT_GOOD;
    const botTone: LaunchTone = botBlockedPct >= BOT_GOOD ? 'good' : botBlockedPct >= BOT_WARN ? 'warning' : 'danger';

    // Server meter uses the projection's load-risk (the same "server pressure"
    // number the player tuned against pre-launch): the raw sim serverLoad clamps
    // to 100 on most heavy onsales and would show every run as identical.
    // CRITICAL messaging keys off the ACTUAL resulting stability — never faked.
    const serverLoadPct = Math.min(100, projections.loadRisk);
    const serverCritical = result.siteStability < STABILITY_CRITICAL;
    const serverTone: LaunchTone = serverLoadPct > LOAD_HOT ? 'danger' : serverLoadPct > LOAD_WARM ? 'warning' : 'good';

    const waveStyle: LaunchVisualModel['waveStyle'] =
        config.waveCount === 1 ? 'single-surge' : config.waveCount <= 4 ? 'organized' : 'strained';

    const frictionPct = projections.fanFriction;
    const frictionSlow = frictionPct > FRICTION_SLOW;
    const checkoutPct = result.checkoutSuccessRate;
    const checkoutStruggling = checkoutPct < CHECKOUT_STRUGGLE;

    const fairnessImbalance = result.fairness < FAIRNESS_IMBALANCE;

    const ticketsStart = level.seats;
    const ticketsEnd = Math.max(0, level.seats - result.realFansServed - result.botTickets);

    // --- Escalating, truth-telling phase copy ---
    const phases: LaunchPhase[] = [
        {
            id: 'live', durationMs: LAUNCH_TIMING.live, tone: 'cyan',
            label: 'SYSTEM LIVE',
            detail: `Waiting room opens at ${level.name} — ${demandDisplay} fans queueing for ${ticketsStart.toLocaleString('en-US')} seats.`,
        },
        {
            id: 'surge', durationMs: LAUNCH_TIMING.surge, tone: requestTier === 'massive' ? 'amber' : 'cyan',
            label: 'REQUEST SURGE',
            detail: requestTier === 'massive'
                ? 'Traffic is arriving faster than provisioning limits — global-scale demand.'
                : requestTier === 'mid'
                    ? 'Request volume climbing hard across every region.'
                    : 'Intense local demand — every fan hits the queue at once.',
        },
        {
            id: 'botfilter', durationMs: LAUNCH_TIMING.botfilter,
            tone: botTone === 'good' ? 'green' : botTone === 'warning' ? 'amber' : 'red',
            label: 'BOT FILTER ENGAGED',
            detail: botLeaked
                ? (botTone === 'danger'
                    ? 'Hostile traffic is punching through the filters — heavy bot leakage.'
                    : 'Filters straining — some automated traffic is slipping through.')
                : 'Filters holding — automated traffic contained at the gate.',
        },
        {
            id: 'waves', durationMs: LAUNCH_TIMING.waves,
            tone: serverCritical ? 'red' : serverTone === 'danger' ? 'red' : serverTone === 'warning' ? 'amber' : 'green',
            label: waveStyle === 'single-surge' ? 'SINGLE-WAVE RELEASE' : 'ENTRY WAVES RELEASED',
            detail: serverCritical
                ? 'LOAD CRITICAL — infrastructure is buckling under the release.'
                : waveStyle === 'single-surge'
                    ? 'The entire crowd hits the server at once — load spiking.'
                    : waveStyle === 'strained'
                        ? `${config.waveCount} waves releasing — repeated surges stressing the platform.`
                        : `${config.waveCount} organized waves releasing — load spreading as planned.`,
        },
        {
            id: 'checkout', durationMs: LAUNCH_TIMING.checkout,
            tone: checkoutStruggling ? 'red' : frictionSlow ? 'amber' : 'green',
            label: 'CHECKOUT UNDER LOAD',
            detail: checkoutStruggling
                ? 'Checkout failures accumulating — carts timing out under pressure.'
                : frictionSlow
                    ? 'Verification queue backing up — throughput slowed but holding.'
                    : 'Checkout processing cleanly — inventory moving to real fans.',
        },
        {
            id: 'finalize', durationMs: LAUNCH_TIMING.finalize, tone: 'cyan',
            label: 'FINALIZING ONSALE',
            detail: fairnessImbalance
                ? 'Closing the books — allocation imbalance flagged for the debrief.'
                : 'Closing the books — compiling the operation record…',
        },
    ];

    return {
        venueName: level.name,
        seats: level.seats,
        demand,
        demandDisplay,
        requestTier,
        botBlockedPct,
        botLeaked,
        botTone,
        serverLoadPct,
        serverTone,
        serverCritical,
        waveCount: config.waveCount,
        waveStyle,
        frictionPct,
        frictionSlow,
        checkoutPct,
        checkoutStruggling,
        fairnessImbalance,
        ticketsStart,
        ticketsEnd,
        phases,
        totalMs: phases.reduce((s, p) => s + p.durationMs, 0),
    };
}
