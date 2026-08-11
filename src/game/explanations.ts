// Queue Quest — per-metric cause analysis for the Results screen.
//
// Answers, for every result metric: what does it mean, which of YOUR choices
// pushed it up, which pushed it down, and what to try next. The simulation model
// (simulation.ts + balance.ts) is the single source of truth — every factor here
// is conditioned on a term the sim actually computes for that metric, and each
// factor is tagged with the lever it describes so tests can prove we never blame
// a control that doesn't touch the metric.
//
// Pure module: no React, no DOM, fully deterministic.

import type { Level, GameConfig, SimulationResult, MetricKey } from './types';
import { applyScenario } from './scenario';
import {
    SIM,
    BOT_DETECTION_EFFECTIVENESS,
    BOT_DETECTION_FRICTION,
    VERIFICATION_EFFECTIVENESS,
    VERIFICATION_FRICTION,
    RESALE_SATISFACTION,
    RESALE_FAIRNESS,
} from './balance';

export type MetricId = 'fans' | 'bots' | 'checkout' | 'satisfaction' | 'stability' | 'fairness';
export type LeverId =
    | 'botDetection' | 'verification' | 'waveCount' | 'waveInterval' | 'purchaseLimit'
    | 'resale' | 'presalePercent' | 'accessiblePercent' | 'waitingRoomTime'
    | 'scenario' | 'demand';

export interface CauseFactor {
    lever: LeverId;      // which control (or context) this factor describes
    label: string;       // short cause ("Enhanced behavioral detection")
    detail: string;      // one concrete sentence tied to actual values
    weight: number;      // relative modeled magnitude, for ranking (higher = bigger effect)
    fix?: string;        // for negative factors: the specific adjustment to try
}

export interface MetricExplanation {
    id: MetricId;
    label: MetricKey;
    definition: string;   // plain-language meaning
    value: number;
    display: string;      // "83%" or "87"
    tone: 'good' | 'warning' | 'danger';
    positiveFactors: CauseFactor[];   // ranked, biggest first
    negativeFactors: CauseFactor[];   // ranked, biggest first
    recommendation: string;           // one concrete next adjustment
}

// Display names for lever settings (mirrors the option tables in data/defaults.ts).
const BOT_LABEL: Record<GameConfig['botDetection'], string> = { low: 'Basic', medium: 'Standard', high: 'Enhanced', aggressive: 'Maximum' };
const VERIFY_LABEL: Record<GameConfig['verification'], string> = { none: 'Open', basic: 'Email', verified: 'ID' };
const RESALE_LABEL: Record<GameConfig['resale'], string> = { none: 'Open resale', caps: 'Price-capped resale', face: 'Face-value resale', no_resale: 'Locked (no resale)' };

const pctOf = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Analyze how the player's configuration produced each result metric.
 * `level` is the RAW mission level — the effective (scenario-adjusted) level the
 * sim actually ran is derived internally via applyScenario, so scenario events
 * can be credited/blamed explicitly.
 */
export function analyzeMetricCauses(level: Level, config: GameConfig, result: SimulationResult): MetricExplanation[] {
    const eff = applyScenario(level);
    const c = config;
    const friction = BOT_DETECTION_FRICTION[c.botDetection] + VERIFICATION_FRICTION[c.verification];
    const botBlock = Math.min(SIM.maxBotBlock, BOT_DETECTION_EFFECTIVENESS[c.botDetection] + VERIFICATION_EFFECTIVENESS[c.verification] * SIM.verificationBlockScale);
    const ratio = Math.round(eff.demand / eff.seats);
    const scenarioBoostedServer = eff.serverRisk > level.serverRisk + 0.001;
    const scenarioBoostedBots = eff.botPressure > level.botPressure + 0.001;
    const scenarioBoostedResale = eff.resalePressure > level.resalePressure + 0.001;

    // ---------- BOTS BLOCKED ----------
    // Model: botsBlockedPct = min(0.98, detection + verification×0.3) — ONLY these two levers.
    const bots = (() => {
        const pos: CauseFactor[] = [];
        const neg: CauseFactor[] = [];
        const det = BOT_DETECTION_EFFECTIVENESS[c.botDetection];
        if (det >= 0.7) {
            pos.push({ lever: 'botDetection', label: `${BOT_LABEL[c.botDetection]} bot detection`, detail: `${BOT_LABEL[c.botDetection]} screening blocks ${pctOf(det)} of automated traffic on its own.`, weight: det * 100 });
        } else {
            neg.push({ lever: 'botDetection', label: `${BOT_LABEL[c.botDetection]} bot detection`, detail: `${BOT_LABEL[c.botDetection]} screening only stops ${pctOf(det)} of bot traffic${eff.botPressure > 0.4 ? ' — far too little at this bot pressure' : ''}.`, weight: (0.9 - det) * 100, fix: 'Raise Bot Detection at least one step.' });
        }
        const vE = VERIFICATION_EFFECTIVENESS[c.verification];
        if (vE > 0) {
            pos.push({ lever: 'verification', label: `${VERIFY_LABEL[c.verification]} verification`, detail: `${VERIFY_LABEL[c.verification]} verification adds ${pctOf(vE * SIM.verificationBlockScale)} extra bot blocking on top of detection.`, weight: vE * SIM.verificationBlockScale * 100 });
        } else {
            neg.push({ lever: 'verification', label: 'No fan verification', detail: 'Open sign-up contributes nothing to bot blocking.', weight: 8, fix: 'Add Email verification for extra bot blocking with little friction.' });
        }
        const rec = neg.length > 0
            ? neg[0].fix!
            : botBlock >= SIM.maxBotBlock
                ? 'Bot blocking is at its ceiling — spend the friction budget elsewhere.'
                : 'Defense is solid; raise it only if bots still grab visible inventory.';
        return build('bots', 'Bots Blocked', result.botsBlockedPct, `${result.botsBlockedPct}%`,
            'The share of automated (bot) ticket-buying traffic your defenses stopped before checkout. Only Bot Detection and Fan Verification move this number.',
            pos, neg, rec, { good: 70, warn: 50 });
    })();

    // ---------- REAL FANS SERVED ----------
    // Model: public pool minus bot ticket grabs, times friction & checkout survival.
    const fans = (() => {
        const pos: CauseFactor[] = [];
        const neg: CauseFactor[] = [];
        neg.push({ lever: 'demand', label: 'Scarcity', detail: `${eff.demand.toLocaleString()} fans competed for ${eff.seats.toLocaleString()} seats (${ratio}:1) — most cannot be served no matter what.`, weight: Math.min(40, ratio), fix: 'Scarcity is fixed — focus on keeping bots and friction from wasting the seats you have.' });
        if (result.botsGotThrough > 0 && BOT_DETECTION_EFFECTIVENESS[c.botDetection] < 0.7) {
            neg.push({ lever: 'botDetection', label: 'Bot ticket grabs', detail: `${result.botTickets.toLocaleString()} tickets went to bots that slipped past ${BOT_LABEL[c.botDetection]} detection.`, weight: Math.min(60, (result.botTickets / eff.seats) * 100), fix: 'Raise Bot Detection so bots stop consuming public inventory.' });
        } else {
            pos.push({ lever: 'botDetection', label: 'Bots kept out of inventory', detail: `Strong defense held bot purchases to ${result.botTickets.toLocaleString()} tickets.`, weight: 20 });
        }
        if (c.waitingRoomTime > 4) {
            neg.push({ lever: 'waitingRoomTime', label: 'Long waiting room', detail: `Opening ${c.waitingRoomTime}h early gave bot operators ${pctOf((c.waitingRoomTime - 1) * SIM.botPrepPerHour)} more ticket-grabbing efficiency.`, weight: (c.waitingRoomTime - 1) * SIM.botPrepPerHour * 100, fix: 'Shorten the waiting room toward 1–2 hours.' });
        }
        if (level.id === 4 && c.waitingRoomTime > 2) {
            neg.push({ lever: 'waitingRoomTime', label: 'Short-notice mismatch', detail: 'On a short-notice onsale, a long waiting room compounds bot preparation further.', weight: (c.waitingRoomTime - 2) * SIM.shortNoticeBotPerHour * 100, fix: 'Keep the waiting room to 1–2 hours on short-notice events.' });
        }
        if (friction > 0.2) {
            neg.push({ lever: 'botDetection', label: 'Heavy friction', detail: `${pctOf(friction)} combined friction turned real fans away before checkout.`, weight: friction * 100, fix: 'Ease Bot Detection or Verification one step.' });
        } else {
            pos.push({ lever: 'verification', label: 'Low friction', detail: `Only ${pctOf(friction)} combined friction — real fans flowed through.`, weight: (0.25 - friction) * 60 });
        }
        if (result.checkoutSuccessRate >= 70) {
            pos.push({ lever: 'waveCount', label: 'Healthy checkout', detail: `${result.checkoutSuccessRate}% checkout success converted queue spots into seats.`, weight: (result.checkoutSuccessRate - 50) * 0.5 });
        } else {
            neg.push({ lever: 'waveCount', label: 'Checkout failures', detail: `Only ${result.checkoutSuccessRate}% of fans completed checkout — failed checkouts waste seats.`, weight: (70 - result.checkoutSuccessRate) * 0.8, fix: 'Stabilize load (2–4 waves) so checkout stops failing.' });
        }
        if (c.presalePercent + c.accessiblePercent > 0) {
            pos.push({ lever: 'presalePercent', label: 'Reserved allocations', detail: `${c.presalePercent}% presale + ${c.accessiblePercent}% accessible seats went directly to verified fan groups.`, weight: (c.presalePercent + c.accessiblePercent) * 0.4 });
        }
        const worst = neg.filter(n => n.lever !== 'demand')[0];
        const rec = worst?.fix ?? 'Trim friction or tighten defense to convert more of the queue into served fans.';
        return build('fans', 'Fans Served', result.fansServedPct, `${result.realFansServed.toLocaleString()} (${result.fansServedPct}%)`,
            'How many real fans (not bots) ended the onsale holding tickets, as a share of all seats. Bots, friction, and checkout failures all eat into it.',
            pos, neg, rec, { good: 50, warn: 25 });
    })();

    // ---------- CHECKOUT SUCCESS ----------
    // Model: stability×0.6 + (100 − friction)×0.4 − (waves>4 penalty).
    const checkout = (() => {
        const pos: CauseFactor[] = [];
        const neg: CauseFactor[] = [];
        if (result.siteStability >= 60) {
            pos.push({ lever: 'waveCount', label: 'Stable platform', detail: `Site stability of ${result.siteStability} kept checkout responsive (stability is ${pctOf(SIM.checkoutStabilityWeight)} of this score).`, weight: result.siteStability * SIM.checkoutStabilityWeight });
        } else {
            neg.push({ lever: 'waveCount', label: 'Unstable platform', detail: `Site stability of ${result.siteStability} caused checkout timeouts (stability is ${pctOf(SIM.checkoutStabilityWeight)} of this score).`, weight: (100 - result.siteStability) * SIM.checkoutStabilityWeight, fix: 'Shore up stability first — 2–4 entry waves is the biggest lever.' });
        }
        if (friction > 0.2) {
            neg.push({ lever: 'verification', label: 'Verification friction', detail: `${BOT_LABEL[c.botDetection]} detection + ${VERIFY_LABEL[c.verification]} verification stack to ${pctOf(friction)} friction at checkout.`, weight: friction * 100 * SIM.checkoutFrictionWeight, fix: 'Lighten Verification or Bot Detection one step.' });
        } else {
            pos.push({ lever: 'verification', label: 'Light checkout friction', detail: `${pctOf(friction)} combined friction left checkout fast.`, weight: (0.25 - friction) * 100 * SIM.checkoutFrictionWeight });
        }
        if (c.waveCount > 4) {
            neg.push({ lever: 'waveCount', label: 'Many waves', detail: `${c.waveCount} entry waves shave ${SIM.checkoutManyWavesPenalty} points off checkout (repeated rushes).`, weight: SIM.checkoutManyWavesPenalty, fix: 'Reduce to 3–4 waves.' });
        }
        const rec = neg[0]?.fix ?? 'Checkout is healthy — protect it by keeping stability and friction where they are.';
        return build('checkout', 'Checkout Rate', result.checkoutSuccessRate, `${result.checkoutSuccessRate}%`,
            'The share of fans who, once through the queue, actually completed a purchase. Driven by platform stability and how much friction your checks add.',
            pos, neg, rec, { good: 70, warn: 50 });
    })();

    // ---------- SATISFACTION ----------
    const satisfaction = (() => {
        const pos: CauseFactor[] = [];
        const neg: CauseFactor[] = [];
        if (friction > 0.15) {
            neg.push({ lever: c.botDetection === 'aggressive' ? 'botDetection' : 'verification', label: 'Screening friction', detail: `${pctOf(friction)} combined friction (worth ~${Math.round(friction * SIM.satFrictionWeight)} points) frustrated legitimate fans.`, weight: friction * SIM.satFrictionWeight, fix: c.botDetection === 'aggressive' ? 'Drop Bot Detection from Maximum to Enhanced.' : 'Ease Verification one step unless bot pressure demands it.' });
        } else {
            pos.push({ lever: 'verification', label: 'Smooth entry', detail: `Light screening (${pctOf(friction)} friction) kept the process painless.`, weight: (0.2 - friction) * SIM.satFrictionWeight });
        }
        if (c.verification === 'verified') {
            neg.push({ lever: 'verification', label: 'ID verification', detail: `Requiring photo ID costs ${SIM.satVerifiedPenalty} points of goodwill on top of its friction.`, weight: SIM.satVerifiedPenalty, fix: eff.botPressure < 0.5 ? 'Downgrade to Email verification — bot pressure here doesn\'t justify ID checks.' : 'Keep ID checks only because bot pressure is extreme; expect the goodwill cost.' });
        }
        if (c.waveCount > 1 && c.waveCount <= 4) {
            pos.push({ lever: 'waveCount', label: 'Comfortable pacing', detail: `${c.waveCount} entry waves felt orderly (+${SIM.satWaveBonus} points).`, weight: SIM.satWaveBonus });
        }
        const resaleSat = RESALE_SATISFACTION[c.resale] + (level.id === 4 ? 0 : 0);
        if (resaleSat > 0) {
            pos.push({ lever: 'resale', label: RESALE_LABEL[c.resale], detail: `${RESALE_LABEL[c.resale]} reads as fan-friendly (+${resaleSat} points).`, weight: resaleSat });
        } else if (resaleSat < 0) {
            neg.push({ lever: 'resale', label: RESALE_LABEL[c.resale], detail: c.resale === 'none' ? `An open resale market angers fans watching scalpers profit (${resaleSat} points).` : `Blocking all transfers frustrates fans with real scheduling conflicts (${resaleSat}${c.resale === 'no_resale' && eff.resalePressure < 0.6 ? ', worse when scalping isn\'t even a big threat here' : ''} points).`, weight: Math.abs(resaleSat) + (c.resale === 'no_resale' && eff.resalePressure < 0.6 ? 4 : 0), fix: c.resale === 'none' ? 'Restrict resale to Face Value or Cap.' : 'Loosen to Face-value resale so legitimate transfers still work.' });
        }
        if (c.waitingRoomTime > 4) {
            neg.push({ lever: 'waitingRoomTime', label: 'Long wait before doors', detail: `A ${c.waitingRoomTime}h waiting room costs ~${Math.round((c.waitingRoomTime - 4) * SIM.satLongWaitPerHour)} points of patience.`, weight: (c.waitingRoomTime - 4) * SIM.satLongWaitPerHour, fix: 'Open the waiting room 1–2 hours before doors instead.' });
        }
        if (result.siteStability < 60) {
            neg.push({ lever: 'waveCount', label: 'Visible instability', detail: `Errors and slowdowns (stability ${result.siteStability}) soured the experience.`, weight: (100 - result.siteStability) * SIM.satInstabilityWeight, fix: 'Add an entry wave to steady the platform.' });
        }
        if (c.accessiblePercent >= 5) {
            pos.push({ lever: 'accessiblePercent', label: 'Accessible coverage', detail: `${c.accessiblePercent}% accessible reservation signals a fair process.`, weight: c.accessiblePercent * SIM.satAccessiblePerPct });
        }
        const rec = neg[0]?.fix ?? 'Push satisfaction higher by trimming any remaining friction.';
        return build('satisfaction', 'Satisfaction', result.satisfaction, `${result.satisfaction}`,
            'How fair, understandable, and painless the onsale felt to legitimate fans — friction, waiting, stability, and resale policy all shape it.',
            pos, neg, rec, { good: 65, warn: 45 });
    })();

    // ---------- SITE STABILITY ----------
    const stability = (() => {
        const pos: CauseFactor[] = [];
        const neg: CauseFactor[] = [];
        neg.push({ lever: 'demand', label: 'Demand crush', detail: `${ratio}:1 demand-to-seat pressure is the baseline load your infrastructure had to absorb.`, weight: Math.min(35, ratio), fix: 'You can\'t lower demand — spread it with entry waves.' });
        if (c.waveCount >= 2 && c.waveCount <= 4) {
            pos.push({ lever: 'waveCount', label: `${c.waveCount} entry waves`, detail: `Staggered entry cut peak load by ~${pctOf((c.waveCount - 1) * SIM.waveReliefPerWave)}.`, weight: (c.waveCount - 1) * SIM.waveReliefPerWave * 100 });
            if (c.waveInterval >= 20) {
                pos.push({ lever: 'waveInterval', label: 'Generous wave spacing', detail: `${c.waveInterval}-minute gaps let load settle between waves.`, weight: Math.min(SIM.intervalReductionCap, (c.waveInterval - 5) * SIM.intervalReductionPerMin) * 100 });
            }
        } else if (c.waveCount === 1) {
            neg.push({ lever: 'waveCount', label: 'Single-wave open', detail: 'The entire crowd hit the server at once — no load relief at all.', weight: 30, fix: 'Split entry into 2–4 waves.' });
        } else if (c.waveCount > 5) {
            neg.push({ lever: 'waveCount', label: `${c.waveCount} waves`, detail: `Waves beyond 5 stress the system (−${(c.waveCount - 5) * SIM.excessWaveStabilityPenalty} stability from repeated restarts).`, weight: (c.waveCount - 5) * SIM.excessWaveStabilityPenalty, fix: 'Reduce to 3–4 waves.' });
        }
        if (c.presalePercent >= 10) {
            pos.push({ lever: 'presalePercent', label: 'Presale load shedding', detail: `${c.presalePercent}% presale moved that demand out of the public rush.`, weight: c.presalePercent * SIM.presaleLoadReductionPerPct * 100 });
        }
        if (scenarioBoostedServer) {
            neg.push({ lever: 'scenario', label: level.identity.scenario.label, detail: `Scenario event raised server risk to ${pctOf(eff.serverRisk)} before doors opened.`, weight: (eff.serverRisk - level.serverRisk) * 100, fix: 'Compensate with an extra wave or more presale on this mission.' });
        } else if (eff.serverRisk > 0.5) {
            neg.push({ lever: 'demand', label: 'Fragile infrastructure', detail: `This venue carries ${pctOf(eff.serverRisk)} inherent server risk.`, weight: eff.serverRisk * 40, fix: 'Lean harder on waves and presale to protect it.' });
        }
        if (c.waitingRoomTime > 12) {
            neg.push({ lever: 'waitingRoomTime', label: 'Marathon waiting room', detail: `Holding connections for ${c.waitingRoomTime}h drains stability (−${Math.round((c.waitingRoomTime - 12) * SIM.longWaitStabilityPenaltyPerHour)}).`, weight: (c.waitingRoomTime - 12) * SIM.longWaitStabilityPenaltyPerHour, fix: 'Shorten the waiting room below 12 hours.' });
        }
        const worst = neg.filter(n => n.fix && n.lever !== 'demand')[0];
        const rec = worst?.fix ?? (result.siteStability >= 60 ? 'Stability held — the wave plan is working.' : 'Add an entry wave or shift more demand into presale.');
        return build('stability', 'Stability', result.siteStability, `${result.siteStability}`,
            'How well the ticketing platform stood up to peak load. Entry waves, wave spacing, and presale all relieve it; demand and server risk attack it.',
            pos, neg, rec, { good: 60, warn: 40 });
    })();

    // ---------- FAIRNESS ----------
    const fairness = (() => {
        const pos: CauseFactor[] = [];
        const neg: CauseFactor[] = [];
        const resaleFair = RESALE_FAIRNESS[c.resale];
        if (resaleFair > 0) {
            pos.push({ lever: 'resale', label: RESALE_LABEL[c.resale], detail: `${RESALE_LABEL[c.resale]} keeps tickets at honest prices (+${resaleFair} fairness${scenarioBoostedResale || eff.resalePressure > 0.7 ? ', extra valuable under heavy resale pressure' : ''}).`, weight: resaleFair + (eff.resalePressure > 0.7 ? 4 : 0) });
        } else {
            neg.push({ lever: 'resale', label: 'Open resale market', detail: `No resale limits let scalpers flip inventory freely (${resaleFair} fairness${eff.resalePressure > 0.7 ? ', amplified by this event\'s extreme resale pressure' : ''}).`, weight: Math.abs(resaleFair) + (eff.resalePressure > 0.7 ? 6 : 0), fix: 'Restrict resale to Face Value or Cap.' });
        }
        if (c.purchaseLimit <= 2) {
            pos.push({ lever: 'purchaseLimit', label: `${c.purchaseLimit}-ticket limit`, detail: `Tight limits spread seats across more buyers (+${(8 - c.purchaseLimit) * SIM.fairPurchaseLimitWeight} fairness).`, weight: (8 - c.purchaseLimit) * SIM.fairPurchaseLimitWeight });
        } else if (c.purchaseLimit >= 6) {
            neg.push({ lever: 'purchaseLimit', label: `${c.purchaseLimit}-ticket limit`, detail: 'High limits let single buyers and bots take large blocks.', weight: c.purchaseLimit * SIM.fairPurchaseLimitWeight, fix: 'Lower the purchase limit toward 2.' });
        }
        if (c.presalePercent > SIM.fairPresaleKnee) {
            const penalty = (c.presalePercent - SIM.fairPresaleKnee) * SIM.fairPresalePenalty1 + Math.max(0, c.presalePercent - SIM.fairPresaleKnee2) * SIM.fairPresalePenalty2;
            neg.push({ lever: 'presalePercent', label: `${c.presalePercent}% presale`, detail: `Presale above ${SIM.fairPresaleKnee}% reads as insiders-first (−${Math.round(penalty)} fairness).`, weight: penalty, fix: `Trim presale toward ${SIM.fairPresaleKnee}%.` });
        }
        if (c.accessiblePercent >= 5) {
            pos.push({ lever: 'accessiblePercent', label: 'Accessible reservation', detail: `${c.accessiblePercent}% accessible coverage (+${Math.round(c.accessiblePercent * SIM.fairAccessiblePerPct)} fairness).`, weight: c.accessiblePercent * SIM.fairAccessiblePerPct });
        } else {
            neg.push({ lever: 'accessiblePercent', label: 'Thin accessible coverage', detail: `Only ${c.accessiblePercent}% reserved for accessible access.`, weight: (5 - c.accessiblePercent) * SIM.fairAccessiblePerPct + 2, fix: 'Raise accessible seats to at least 5%.' });
        }
        if (result.botsBlockedPct >= 70) {
            pos.push({ lever: 'botDetection', label: 'Bots shut out', detail: `Blocking ${result.botsBlockedPct}% of bots kept inventory with real fans (+${Math.round((result.botsBlockedPct / 100) * SIM.fairBotsBlockedWeight)} fairness).`, weight: (result.botsBlockedPct / 100) * SIM.fairBotsBlockedWeight });
        } else {
            neg.push({ lever: 'botDetection', label: 'Bot leakage', detail: `Only ${result.botsBlockedPct}% of bots were blocked — leaked bots skew who gets tickets.`, weight: ((100 - result.botsBlockedPct) / 100) * SIM.fairBotsBlockedWeight + 4, fix: 'Raise Bot Detection one step.' });
        }
        if (VERIFICATION_EFFECTIVENESS[c.verification] > 0) {
            pos.push({ lever: 'verification', label: `${VERIFY_LABEL[c.verification]} verification`, detail: `Verified buyers make distribution more accountable (+${Math.round(VERIFICATION_EFFECTIVENESS[c.verification] * SIM.fairVerificationWeight)} fairness).`, weight: VERIFICATION_EFFECTIVENESS[c.verification] * SIM.fairVerificationWeight });
        }
        const rec = neg[0]?.fix ?? 'Fairness is strong — hold the line on resale and limits.';
        return build('fairness', 'Fairness', result.fairness, `${result.fairness}`,
            'Whether tickets ended up with everyday fans at honest prices — resale policy, purchase limits, presale size, accessibility, and bot blocking all count.',
            pos, neg, rec, { good: 70, warn: 50 });
    })();

    return [fans, bots, checkout, satisfaction, stability, fairness];
}

function build(
    id: MetricId, label: MetricKey, value: number, display: string, definition: string,
    pos: CauseFactor[], neg: CauseFactor[], recommendation: string,
    thresholds: { good: number; warn: number },
): MetricExplanation {
    pos.sort((a, b) => b.weight - a.weight);
    neg.sort((a, b) => b.weight - a.weight);
    const tone = value >= thresholds.good ? 'good' : value >= thresholds.warn ? 'warning' : 'danger';
    return { id, label, definition, value, display, tone, positiveFactors: pos, negativeFactors: neg, recommendation };
}

// ---------- Run-level causal summary ----------

export interface RunCausalSummary {
    topPositive: { metric: MetricKey; factor: CauseFactor };
    topNegative: { metric: MetricKey; factor: CauseFactor } | null;
    recommendation: string;   // the single highest-impact change to try next
}

const METRIC_WEIGHT_KEY: Record<MetricId, keyof Level['weights']> = {
    fans: 'fans', bots: 'bots', checkout: 'checkout', satisfaction: 'satisfaction', stability: 'stability', fairness: 'fairness',
};

/**
 * Boil the full analysis down to: biggest thing that helped, biggest thing that
 * hurt (excluding unfixable context like raw demand), and the one change to try.
 * Impact ranks by factor magnitude × this mission's metric weighting, so the
 * summary points at what actually moved THIS mission's score.
 */
export function summarizeRun(explanations: MetricExplanation[], level: Level): RunCausalSummary {
    let topPositive: RunCausalSummary['topPositive'] | null = null;
    let topNegative: RunCausalSummary['topNegative'] = null;
    let bestPos = -1, bestNeg = -1;
    let recommendation = '';

    for (const e of explanations) {
        const w = level.weights[METRIC_WEIGHT_KEY[e.id]];
        const pos = e.positiveFactors[0];
        if (pos && pos.weight * w > bestPos) {
            bestPos = pos.weight * w;
            topPositive = { metric: e.label, factor: pos };
        }
        // Skip context factors when picking the headline problem — "demand was
        // high" isn't a choice the player made, even when its card copy carries
        // coping advice. Headlines must point at an actual lever.
        const neg = e.negativeFactors.find(n => n.fix && n.lever !== 'demand');
        if (neg && neg.weight * w > bestNeg) {
            bestNeg = neg.weight * w;
            topNegative = { metric: e.label, factor: neg };
            recommendation = neg.fix!;
        }
    }

    return {
        topPositive: topPositive ?? { metric: 'Fairness', factor: { lever: 'resale', label: 'Steady configuration', detail: 'No single lever stood out — the setup was balanced.', weight: 0 } },
        topNegative,
        recommendation: recommendation || 'This setup is near its ceiling — experiment with a different strategy for style points.',
    };
}
