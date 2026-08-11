// Queue Quest — Live Operational Decisions.
//
// Mid-shift judgment calls. Fully deterministic: which decision appears and
// exactly when is a pure function of the tick count. Each decision presents two
// options with genuine tradeoffs (never a perfect answer). Taking an option
// applies a temporary modifier to the running sim; ignoring it is always viable.

import type { DecisionDef, DecisionId, DecisionOption } from './types';
import { TICKS_PER_WAVE } from './endless';
import { DECISION } from './balance';

// Cadence values live in balance.ts (DECISION). Re-exported here so existing
// importers (endless.ts, screens, tests) keep their entry point.
export const DECISION_PERIOD = DECISION.period;      // seconds between offered decisions
export const DECISION_TIMEOUT = DECISION.timeout;    // seconds on screen before it counts as ignored
export const EFFECT_DURATION = DECISION.effectDuration; // seconds a taken decision's modifier lasts

// Helper to keep option definitions terse.
function opt(o: Partial<DecisionOption> & Pick<DecisionOption, 'id' | 'label' | 'correct' | 'tradeoffs' | 'historyLabel'>): DecisionOption {
    return {
        durationTicks: EFFECT_DURATION,
        botBlockAdd: 0,
        frictionAdd: 0,
        stabilityDrainAdd: 0,
        fairnessDrainAdd: 0,
        patienceDrainAdd: 0,
        ...o,
    };
}

// The catalogue. `correct` marks the intended judgment call for that scenario.
//
// Balance contract (verified by the balance harness + tests):
//   * A correct option's NET effect helps survival — the relief on the meter it
//     protects outweighs its cost on another meter.
//   * A wrong option's NET effect hurts — it trades a small, short-lived gain for
//     a larger cost.
//   * Neither is a free lunch: every option shows one improving and one worsening
//     meter. Tradeoff rows name the three survival meters directly (Stability,
//     Fairness, Fan Patience) so they map 1:1 to what the HUD shows moving.
//
// Because relief is only useful on a meter under pressure, correct calls weight
// their benefit toward Stability and Fan Patience (the meters that usually bind)
// while the cost lands where the player typically has headroom.
export const DECISIONS: Record<DecisionId, DecisionDef> = {
    server_load: {
        id: 'server_load',
        alert: 'Server under heavy load.',
        question: 'Increase queue delay?',
        options: [
            opt({
                id: 'yes', label: 'Increase Delay', correct: true,
                stabilityDrainAdd: -1.0,     // strong server relief (the point of the call)
                patienceDrainAdd: 0.3,       // fans wait a little longer
                tradeoffs: [{ label: 'Stability', good: true }, { label: 'Fan Patience', good: false }],
                historyLabel: 'Delayed queue release',
            }),
            opt({
                id: 'no', label: 'Hold Release', correct: false,
                stabilityDrainAdd: 0.7,      // load keeps climbing
                patienceDrainAdd: -0.15,     // fans move fast (for now)
                tradeoffs: [{ label: 'Fan Patience', good: true }, { label: 'Stability', good: false }],
                historyLabel: 'Held queue release under load',
            }),
        ],
    },
    bot_attack: {
        id: 'bot_attack',
        alert: 'Bot attack detected.',
        question: 'Increase verification?',
        options: [
            opt({
                id: 'yes', label: 'Increase Verification', correct: true,
                botBlockAdd: 0.15,           // more bots caught (helps throughput/score)
                stabilityDrainAdd: -0.5,     // fewer bots hammering the server
                fairnessDrainAdd: -0.3,      // fairer once bots are curbed
                patienceDrainAdd: 0.3,       // extra checks add friction
                tradeoffs: [{ label: 'Stability', good: true }, { label: 'Fan Patience', good: false }],
                historyLabel: 'Enabled aggressive verification',
            }),
            opt({
                id: 'no', label: 'Keep It Light', correct: false,
                stabilityDrainAdd: 0.4,      // bots keep loading the server
                fairnessDrainAdd: 0.4,       // bots erode fairness
                patienceDrainAdd: -0.15,     // no added friction
                tradeoffs: [{ label: 'Fan Patience', good: true }, { label: 'Fairness', good: false }],
                historyLabel: 'Rejected extra verification',
            }),
        ],
    },
    vip_demand: {
        id: 'vip_demand',
        alert: 'Unexpected VIP demand.',
        question: 'Expand VIP allocation?',
        options: [
            opt({
                id: 'yes', label: 'Expand VIP', correct: false,
                stabilityDrainAdd: -0.25,    // presale slightly relieves public load
                fairnessDrainAdd: 0.6,       // public feels shut out
                patienceDrainAdd: 0.3,       // public fans frustrated
                tradeoffs: [{ label: 'Stability', good: true }, { label: 'Fairness', good: false }],
                historyLabel: 'Expanded VIP allocation',
            }),
            opt({
                id: 'no', label: 'Protect Public', correct: true,
                fairnessDrainAdd: -0.4,      // public inventory protected
                patienceDrainAdd: -0.4,      // the majority of fans stay happy
                stabilityDrainAdd: 0.2,      // public load stays high
                tradeoffs: [{ label: 'Fan Patience', good: true }, { label: 'Stability', good: false }],
                historyLabel: 'Rejected VIP expansion',
            }),
        ],
    },
    accessibility_spike: {
        id: 'accessibility_spike',
        alert: 'Accessibility demand spike.',
        question: 'Reserve additional inventory?',
        options: [
            opt({
                id: 'yes', label: 'Reserve More', correct: true,
                fairnessDrainAdd: -0.5,      // strong fairness lift
                patienceDrainAdd: -0.3,      // fans reward a fair process
                stabilityDrainAdd: 0.25,     // tighter public flow adds load
                tradeoffs: [{ label: 'Fairness', good: true }, { label: 'Stability', good: false }],
                historyLabel: 'Expanded accessibility allocation',
            }),
            opt({
                id: 'no', label: 'Maintain Allocation', correct: false,
                fairnessDrainAdd: 0.6,       // coverage falls short
                stabilityDrainAdd: -0.2,     // public flow unimpeded (minor relief)
                tradeoffs: [{ label: 'Stability', good: true }, { label: 'Fairness', good: false }],
                historyLabel: 'Maintained accessibility allocation',
            }),
        ],
    },
    payment_latency: {
        id: 'payment_latency',
        alert: 'Payment provider latency.',
        question: 'Slow entry to protect checkout?',
        options: [
            opt({
                id: 'yes', label: 'Slow Entry', correct: true,
                stabilityDrainAdd: -1.0,     // eases checkout congestion
                patienceDrainAdd: 0.3,       // fans wait
                tradeoffs: [{ label: 'Stability', good: true }, { label: 'Fan Patience', good: false }],
                historyLabel: 'Slowed entry for checkout',
            }),
            opt({
                id: 'no', label: 'Keep Flowing', correct: false,
                stabilityDrainAdd: 0.7,      // checkouts fail under latency
                patienceDrainAdd: -0.15,
                tradeoffs: [{ label: 'Fan Patience', good: true }, { label: 'Stability', good: false }],
                historyLabel: 'Risked checkout failures',
            }),
        ],
    },
    resale_abuse: {
        id: 'resale_abuse',
        alert: 'Resale abuse detected.',
        question: 'Increase resale restrictions?',
        options: [
            opt({
                id: 'yes', label: 'Restrict Resale', correct: true,
                fairnessDrainAdd: -0.5,      // curbs scalping
                patienceDrainAdd: -0.3,      // real fans trust the system
                stabilityDrainAdd: 0.25,     // extra transfer checks add load
                tradeoffs: [{ label: 'Fairness', good: true }, { label: 'Stability', good: false }],
                historyLabel: 'Tightened resale restrictions',
            }),
            opt({
                id: 'no', label: 'Maintain Openness', correct: false,
                fairnessDrainAdd: 0.6,       // scalpers exploit
                stabilityDrainAdd: -0.2,     // no extra transfer checks (minor relief)
                tradeoffs: [{ label: 'Stability', good: true }, { label: 'Fairness', good: false }],
                historyLabel: 'Kept resale open',
            }),
        ],
    },
};

// Deterministic decision order, cycled as the shift progresses. Chosen so the
// scenario often (but not always) echoes the pressure the player is under.
const DECISION_ORDER: DecisionId[] = [
    'server_load', 'bot_attack', 'vip_demand',
    'accessibility_spike', 'payment_latency', 'resale_abuse',
];

// Which decision (if any) is offered on this exact tick. Offered every
// DECISION_PERIOD ticks after the wave-1 grace period, on a fixed rotation.
// Offset from incidents so the two systems don't always coincide.
export function decisionStartingAt(tick: number): DecisionDef | null {
    const OFFSET = DECISION.firstOffset;                // lands the first decision at tick 75, mid-wave-2
    const sinceStart = tick - (TICKS_PER_WAVE + OFFSET);
    if (sinceStart < 0) return null;
    if (sinceStart % DECISION_PERIOD !== 0) return null;
    const index = sinceStart / DECISION_PERIOD;
    const id = DECISION_ORDER[index % DECISION_ORDER.length];
    return DECISIONS[id];
}

export function findOption(def: DecisionDef, optionId: 'yes' | 'no'): DecisionOption {
    return def.options[0].id === optionId ? def.options[0] : def.options[1];
}
