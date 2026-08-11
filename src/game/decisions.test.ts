import { describe, it, expect } from 'vitest';
import {
    createEndlessState,
    stepEndless,
    applyDecision,
    endlessResultFromState,
    TICKS_PER_WAVE,
} from './endless';
import {
    DECISIONS,
    decisionStartingAt,
    DECISION_PERIOD,
    DECISION_TIMEOUT,
    EFFECT_DURATION,
} from './decisions';
import { createEmptyStore, applyEndlessResult, operationalAccuracy } from './records';
import type { EndlessConfig, EndlessState } from './types';

const config: EndlessConfig = {
    botDetection: 'high', verification: 'basic', purchaseLimit: 2, resale: 'face',
    waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 8,
};

// Advance to (and just past) a given tick, optionally answering any decision
// with `answer` on the first tick it appears.
function advanceTo(targetTick: number, opts?: { answer?: 'yes' | 'no'; ignore?: boolean }) {
    let state = createEndlessState();
    let answered = false;
    while (state.tick < targetTick && !state.over) {
        state = stepEndless(state, config);
        if (state.activeDecision && opts?.answer && !answered && !opts.ignore) {
            state = applyDecision(state, opts.answer);
            answered = true;
        }
    }
    return state;
}

describe('Decisions — deterministic generation', () => {
    it('every catalogue entry has exactly two options, one marked correct', () => {
        for (const def of Object.values(DECISIONS)) {
            expect(def.options).toHaveLength(2);
            const correctCount = def.options.filter(o => o.correct).length;
            expect(correctCount).toBe(1);
            expect(def.options[0].id).toBe('yes');
            expect(def.options[1].id).toBe('no');
        }
    });

    it('every option has at least two tradeoffs (never a free lunch)', () => {
        for (const def of Object.values(DECISIONS)) {
            for (const o of def.options) {
                expect(o.tradeoffs.length).toBeGreaterThanOrEqual(2);
                // A genuine tradeoff has at least one good and one bad row.
                expect(o.tradeoffs.some(t => t.good)).toBe(true);
                expect(o.tradeoffs.some(t => !t.good)).toBe(true);
            }
        }
    });

    it('no decisions during the wave-1 grace period', () => {
        for (let t = 0; t < TICKS_PER_WAVE; t++) {
            expect(decisionStartingAt(t)).toBeNull();
        }
    });

    it('decisions appear on a fixed cadence and are deterministic', () => {
        const firstTick = TICKS_PER_WAVE + 30;
        const first = decisionStartingAt(firstTick);
        expect(first).not.toBeNull();
        expect(decisionStartingAt(firstTick)?.id).toBe(first?.id);           // same tick → same decision
        expect(decisionStartingAt(firstTick + 1)).toBeNull();                 // off-cadence → none
        expect(decisionStartingAt(firstTick + DECISION_PERIOD)).not.toBeNull(); // next period → another
    });
});

describe('Decisions — appearance & expiry', () => {
    it('a decision becomes active on schedule', () => {
        const firstTick = TICKS_PER_WAVE + 30;
        const state = advanceTo(firstTick);
        expect(state.activeDecision).not.toBeNull();
        expect(state.activeDecision!.ticksRemaining).toBe(DECISION_TIMEOUT);
    });

    it('an ignored decision expires after the timeout and is tallied as ignored', () => {
        const firstTick = TICKS_PER_WAVE + 30;
        // Advance until the decision appears, then keep stepping without answering.
        let state = advanceTo(firstTick);
        expect(state.activeDecision).not.toBeNull();
        for (let i = 0; i < DECISION_TIMEOUT + 1 && !state.over; i++) {
            state = stepEndless(state, config);
        }
        expect(state.activeDecision).toBeNull();
        expect(state.tally.ignored).toBeGreaterThanOrEqual(1);
        expect(state.history.some(h => h.kind === 'ignored')).toBe(true);
    });
});

describe('Decisions — application', () => {
    it('taking the correct option tallies a correct decision and records history', () => {
        const firstTick = TICKS_PER_WAVE + 30;
        const def = decisionStartingAt(firstTick)!;
        const correctOption = def.options.find(o => o.correct)!;

        const state = advanceTo(firstTick, { answer: correctOption.id });
        expect(state.tally.correct).toBe(1);
        expect(state.tally.wrong).toBe(0);
        expect(state.activeDecision).toBeNull();       // cleared after answering
        expect(state.modifiers.length).toBeGreaterThanOrEqual(1);
        expect(state.history[state.history.length - 1].kind).toBe('correct');
        expect(state.history[state.history.length - 1].historyLabel).toBe(correctOption.historyLabel);
    });

    it('taking the wrong option tallies a wrong decision', () => {
        const firstTick = TICKS_PER_WAVE + 30;
        const def = decisionStartingAt(firstTick)!;
        const wrongOption = def.options.find(o => !o.correct)!;
        const state = advanceTo(firstTick, { answer: wrongOption.id });
        expect(state.tally.wrong).toBe(1);
        expect(state.tally.correct).toBe(0);
    });

    it('applyDecision is a no-op when no decision is active', () => {
        const s0 = createEndlessState();
        const s1 = applyDecision(s0, 'yes');
        expect(s1).toBe(s0);
    });

    it('applyDecision is pure — does not mutate the input', () => {
        const firstTick = TICKS_PER_WAVE + 30;
        const state = advanceTo(firstTick);
        const snapshot = JSON.stringify(state);
        applyDecision(state, 'yes');
        expect(JSON.stringify(state)).toBe(snapshot);
    });

    it('a decision modifier actually changes the sim outcome', () => {
        const firstTick = TICKS_PER_WAVE + 30;
        const def = decisionStartingAt(firstTick)!;

        // Two branches from the SAME pre-decision state: answer vs. ignore.
        let base = advanceTo(firstTick);
        const answered = applyDecision(base, def.options[0].id);

        // Step both a few ticks and compare a meter.
        let a = answered;
        let b = base;
        for (let i = 0; i < 5 && !a.over && !b.over; i++) {
            a = stepEndless(a, config);
            b = stepEndless(b, config);
        }
        // At least one survival meter should differ once a modifier is in play.
        const differs = a.stability !== b.stability || a.fairness !== b.fairness || a.fanPatience !== b.fanPatience;
        expect(differs).toBe(true);
    });

    it('modifiers expire after EFFECT_DURATION ticks', () => {
        const firstTick = TICKS_PER_WAVE + 30;
        const sourceId = decisionStartingAt(firstTick)!.id;
        let state = advanceTo(firstTick, { answer: 'yes' });
        expect(state.modifiers.some(m => m.sourceId === sourceId)).toBe(true);
        // Step well past the effect duration; the modifier should clear.
        // (No new decision is offered in this window, so it isolates the lifecycle.)
        for (let i = 0; i < EFFECT_DURATION + 2 && !state.over; i++) {
            state = stepEndless(state, config);
        }
        expect(state.modifiers.some(m => m.sourceId === sourceId)).toBe(false);
    });
});

describe('Decisions — correct streak tracking', () => {
    it('tracks the longest correct streak across a run', () => {
        // Build a synthetic state and drive the tally through applyDecision-like updates
        // by advancing and always answering correctly.
        let state: EndlessState = createEndlessState();
        let correctAnswers = 0;
        // Run for a while, answering each decision with its correct option.
        for (let i = 0; i < 400 && !state.over; i++) {
            state = stepEndless(state, config);
            if (state.activeDecision) {
                const correct = state.activeDecision.def.options.find(o => o.correct)!;
                state = applyDecision(state, correct.id);
                correctAnswers++;
            }
        }
        if (correctAnswers >= 2) {
            expect(state.tally.longestCorrectStreak).toBeGreaterThanOrEqual(2);
            expect(state.tally.correct).toBe(correctAnswers);
            expect(state.tally.wrong).toBe(0);
        }
    });
});

describe('Decisions — persistence & history', () => {
    it('run result carries decision counts and history', () => {
        // Answer correctly whenever possible until the shift ends.
        let state = createEndlessState();
        for (let i = 0; i < 100000 && !state.over; i++) {
            state = stepEndless(state, config);
            if (state.activeDecision) {
                const correct = state.activeDecision.def.options.find(o => o.correct)!;
                state = applyDecision(state, correct.id);
            }
        }
        const result = endlessResultFromState(state);
        expect(result.decisionsCorrect).toBe(state.tally.correct);
        expect(result.history.length).toBe(state.history.length);
        expect(result.longestCorrectStreak).toBe(state.tally.longestCorrectStreak);
    });

    it('applyEndlessResult accumulates decision aggregates', () => {
        const store = createEmptyStore();
        const result = {
            timeSurvived: 120, wavesReached: 3, fansServed: 5000, botsBlocked: 500,
            highestCombo: 10, stability: 40, fairness: 60, operatorScore: 3000,
            endReason: 'stability' as const,
            decisionsCorrect: 3, decisionsWrong: 1, decisionsIgnored: 2, longestCorrectStreak: 2,
            history: [],
        };
        const { store: after } = applyEndlessResult(store, result, 1000);
        expect(after.endless!.totalDecisionsCorrect).toBe(3);
        expect(after.endless!.totalDecisionsWrong).toBe(1);
        expect(after.endless!.totalDecisionsIgnored).toBe(2);
        expect(after.endless!.bestCorrectStreak).toBe(2);

        // A second run accumulates.
        const { store: after2 } = applyEndlessResult(after, { ...result, decisionsCorrect: 5, longestCorrectStreak: 4 }, 2000);
        expect(after2.endless!.totalDecisionsCorrect).toBe(8);
        expect(after2.endless!.bestCorrectStreak).toBe(4);
    });

    it('operationalAccuracy computes correct/answered percentage', () => {
        expect(operationalAccuracy(undefined)).toBeNull();
        const store = createEmptyStore();
        const { store: after } = applyEndlessResult(store, {
            timeSurvived: 60, wavesReached: 2, fansServed: 100, botsBlocked: 10,
            highestCombo: 1, stability: 50, fairness: 50, operatorScore: 100,
            endReason: 'fairness' as const,
            decisionsCorrect: 3, decisionsWrong: 1, decisionsIgnored: 5, longestCorrectStreak: 2,
            history: [],
        }, 1);
        // 3 correct of 4 answered (ignored excluded) = 75%.
        expect(operationalAccuracy(after.endless)).toBe(75);
    });

    it('operationalAccuracy is null when nothing has been answered', () => {
        const store = createEmptyStore();
        const { store: after } = applyEndlessResult(store, {
            timeSurvived: 60, wavesReached: 2, fansServed: 100, botsBlocked: 10,
            highestCombo: 1, stability: 50, fairness: 50, operatorScore: 100,
            endReason: 'fairness' as const,
            decisionsCorrect: 0, decisionsWrong: 0, decisionsIgnored: 3, longestCorrectStreak: 0,
            history: [],
        }, 1);
        expect(operationalAccuracy(after.endless)).toBeNull();
    });
});

describe('Decisions — ignoring stays viable', () => {
    it('ignoring decisions does not immediately end the shift', () => {
        // Run ignoring everything; the shift should still last a reasonable time
        // (decisions are optional, not mandatory).
        const state = advanceTo(TICKS_PER_WAVE + 30 + DECISION_TIMEOUT + 5, { ignore: true });
        expect(state.tick).toBeGreaterThan(TICKS_PER_WAVE);
    });
});

describe('Decisions — balance contract (good helps, bad hurts)', () => {
    // Run a full shift under a fixed policy: always take the correct option,
    // always take the wrong one, or ignore every decision.
    function runPolicy(cfg: EndlessConfig, policy: 'correct' | 'wrong' | 'ignore') {
        let s = createEndlessState();
        while (!s.over && s.tick < 100000) {
            s = stepEndless(s, cfg);
            if (s.activeDecision && policy !== 'ignore') {
                const o = s.activeDecision.def.options.find(x => (policy === 'correct' ? x.correct : !x.correct))!;
                s = applyDecision(s, o.id);
            }
        }
        return s;
    }

    // A config that survives well past several decisions so the effect is visible.
    const durable: EndlessConfig = {
        botDetection: 'low', verification: 'none', purchaseLimit: 1, resale: 'none',
        waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 30, accessiblePercent: 1,
    };

    it('correct decisions never survive less than wrong decisions, on a durable config', () => {
        const correct = runPolicy(durable, 'correct');
        const wrong = runPolicy(durable, 'wrong');
        expect(correct.tally.correct).toBeGreaterThanOrEqual(2);   // faced several decisions
        expect(correct.tick).toBeGreaterThanOrEqual(wrong.tick);
    });

    it('correct decisions are at least as good as ignoring, on a durable config', () => {
        const correct = runPolicy(durable, 'correct');
        const ignored = runPolicy(durable, 'ignore');
        expect(correct.tick).toBeGreaterThanOrEqual(ignored.tick);
    });

    it('aggregated across many configs, correct beats wrong on average survival', () => {
        const bots: EndlessConfig['botDetection'][] = ['low', 'medium', 'high', 'aggressive'];
        const resales: EndlessConfig['resale'][] = ['none', 'caps', 'face', 'no_resale'];
        let correctSum = 0, wrongSum = 0, n = 0;
        for (const b of bots) for (const r of resales) for (const wc of [2, 4]) for (const pp of [0, 30]) {
            const cfg: EndlessConfig = {
                botDetection: b, verification: 'none', purchaseLimit: 1, resale: r,
                waveCount: wc, waveInterval: 20, waitingRoomTime: 2, presalePercent: pp, accessiblePercent: 1,
            };
            // Only count configs that live long enough to face >= 2 decisions.
            const ig = runPolicy(cfg, 'ignore');
            if (ig.tick < 135) continue;
            correctSum += runPolicy(cfg, 'correct').tick;
            wrongSum += runPolicy(cfg, 'wrong').tick;
            n++;
        }
        expect(n).toBeGreaterThan(0);
        expect(correctSum).toBeGreaterThan(wrongSum);
    });
});
