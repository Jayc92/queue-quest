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

export type LaunchPhaseId = 'live' | 'surge' | 'botfilter' | 'waves' | 'server' | 'checkout' | 'inventory' | 'finalize';
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
    /** Meter level during the WAVES beat — the SERVER beat completes the climb. */
    serverEarlyPct: number;
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

// Tension-curve timing (ms). Total = 8s: calm → rising traffic → concern →
// peak stress (the dedicated SERVER UNDER LOAD beat) → partial resolution →
// suspense → reveal. Each beat is long enough to actually READ its counters;
// a Skip appears after ~1.8s so repeat runs are never trapped.
export const LAUNCH_TIMING: Record<LaunchPhaseId, number> = {
    live: 800,        // waiting room opens, request counter starts climbing
    surge: 1200,      // traffic accelerates, demand counter climbs visibly
    botfilter: 1200,  // blocked/leaked becomes readable — did the bot setup work?
    waves: 1300,      // release pattern: staggered groups vs one dump; load starts rising
    server: 1300,     // PEAK STRESS — load approaches its true run-derived level
    checkout: 1200,   // successes/failures accumulate, inventory starts dropping
    inventory: 700,   // ticket counter closes toward its final state
    finalize: 300,    // brief held breath, then the reveal
};

/** Reduced-motion runs compress every phase by this factor (8s → 2.4s; states are kept). */
export const LAUNCH_REDUCED_SCALE = 0.3;
/** The Skip affordance appears after this much of the sequence has played. */
export const LAUNCH_SKIP_AFTER_MS = 1800;

/**
 * How far (fraction of the true value) the server meter climbs during the WAVES
 * beat, before the SERVER beat carries it the rest of the way — the gradual
 * approach is what gives the peak-stress moment time to land.
 */
export const LAUNCH_SERVER_EARLY_FRACTION = 0.55;

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
    const serverEarlyPct = Math.round(serverLoadPct * LAUNCH_SERVER_EARLY_FRACTION);
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
            // Release-pattern beat: HOW the crowd hits — load only STARTS here.
            id: 'waves', durationMs: LAUNCH_TIMING.waves,
            tone: waveStyle === 'single-surge' ? 'amber' : waveStyle === 'strained' ? 'amber' : 'green',
            label: waveStyle === 'single-surge' ? 'SINGLE-WAVE RELEASE' : 'ENTRY WAVES RELEASED',
            detail: waveStyle === 'single-surge'
                ? 'No staggering — the entire crowd is heading for the server at once.'
                : waveStyle === 'strained'
                    ? `${config.waveCount} waves releasing — repeated surges queuing up against the platform.`
                    : `${config.waveCount} organized waves releasing — the crowd is entering in controlled groups.`,
        },
        {
            // PEAK STRESS — the anxiety beat. Load completes its climb to the true
            // run-derived level; CRITICAL messaging only when stability truly broke.
            id: 'server', durationMs: LAUNCH_TIMING.server,
            tone: serverCritical || serverTone === 'danger' ? 'red' : serverTone === 'warning' ? 'amber' : 'green',
            label: 'SERVER UNDER LOAD',
            detail: serverCritical
                ? 'LOAD CRITICAL — infrastructure is buckling under the release.'
                : serverTone === 'danger'
                    ? 'Load pushing deep into the red — systems holding… barely.'
                    : serverTone === 'warning'
                        ? 'Pressure climbing hard — the platform is strained but standing.'
                        : 'Load rising under the full crowd — the platform is holding steady.',
        },
        {
            id: 'checkout', durationMs: LAUNCH_TIMING.checkout,
            tone: checkoutStruggling ? 'red' : frictionSlow ? 'amber' : 'green',
            label: 'CHECKOUT PROCESSING',
            detail: checkoutStruggling
                ? 'Checkout failures accumulating — carts timing out under pressure.'
                : frictionSlow
                    ? 'Verification queue backing up — throughput slowed but holding.'
                    : 'Checkout processing cleanly — inventory moving to real fans.',
        },
        {
            // Partial resolution: inventory closes toward its final state.
            id: 'inventory', durationMs: LAUNCH_TIMING.inventory,
            tone: fairnessImbalance ? 'amber' : 'cyan',
            label: 'INVENTORY CLOSING',
            detail: fairnessImbalance
                ? 'Final allocations processing — allocation imbalance flagged for the debrief.'
                : 'Final allocations processing — the last seats are being assigned.',
        },
        {
            // The held breath: the player still doesn't know if it worked.
            id: 'finalize', durationMs: LAUNCH_TIMING.finalize, tone: 'cyan',
            label: 'FINALIZING ONSALE',
            detail: 'Compiling the operation record…',
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
        serverEarlyPct,
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
