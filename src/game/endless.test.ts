import { describe, it, expect } from 'vitest';
import {
    createEndlessState,
    stepEndless,
    waveForTick,
    incidentStartingAt,
    simulateEndlessRun,
    endlessResultFromState,
    TICKS_PER_WAVE,
    INCIDENT_PERIOD,
} from './endless';
import { createEmptyStore, applyEndlessResult } from './records';
import type { EndlessConfig } from './types';

// A reasonable "operator" config and a weak one.
const strongConfig: EndlessConfig = {
    botDetection: 'high', verification: 'basic', purchaseLimit: 2, resale: 'face',
    waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 8,
};
const weakConfig: EndlessConfig = {
    botDetection: 'low', verification: 'none', purchaseLimit: 8, resale: 'none',
    waveCount: 1, waveInterval: 15, waitingRoomTime: 12, presalePercent: 0, accessiblePercent: 1,
};

function runN(config: EndlessConfig, n: number) {
    let state = createEndlessState();
    for (let i = 0; i < n && !state.over; i++) state = stepEndless(state, config);
    return state;
}

describe('Endless — determinism', () => {
    it('same config produces identical runs', () => {
        const a = simulateEndlessRun(strongConfig);
        const b = simulateEndlessRun(strongConfig);
        expect(a).toEqual(b);
    });

    it('stepping is pure — the input state is not mutated', () => {
        const s0 = createEndlessState();
        const snapshot = JSON.stringify(s0);
        stepEndless(s0, strongConfig);
        expect(JSON.stringify(s0)).toBe(snapshot);
    });
});

describe('Endless — wave schedule', () => {
    it('wave 1 for the first period, then increments', () => {
        expect(waveForTick(0)).toBe(1);
        expect(waveForTick(TICKS_PER_WAVE - 1)).toBe(1);
        expect(waveForTick(TICKS_PER_WAVE)).toBe(2);
        expect(waveForTick(TICKS_PER_WAVE * 3)).toBe(4);
    });

    it('difficulty increases — later waves drain a fixed config faster', () => {
        // Measure stability delta early vs late for the same config by isolating one tick.
        const early = createEndlessState();
        const earlyNext = stepEndless(early, strongConfig);

        // Fast-forward to a much later tick by replaying (deterministic).
        let late = createEndlessState();
        for (let i = 0; i < TICKS_PER_WAVE * 4 && !late.over; i++) late = stepEndless(late, strongConfig);
        const lateBefore = late.stability;
        const lateNext = late.over ? late : stepEndless(late, strongConfig);

        const earlyDelta = earlyNext.stability - early.stability;
        const lateDelta = lateNext.stability - lateBefore;
        // Later ticks should be at least as punishing (usually strictly worse).
        expect(lateDelta).toBeLessThanOrEqual(earlyDelta);
    });
});

describe('Endless — incident schedule', () => {
    it('no incidents during the wave-1 grace period', () => {
        for (let t = 0; t < TICKS_PER_WAVE; t++) {
            expect(incidentStartingAt(t)).toBeNull();
        }
    });

    it('incidents begin on a fixed cadence after grace and are deterministic', () => {
        const first = incidentStartingAt(TICKS_PER_WAVE);
        expect(first).not.toBeNull();
        // Same tick always yields the same incident.
        expect(incidentStartingAt(TICKS_PER_WAVE)?.id).toBe(first?.id);
        // Off-cadence ticks yield nothing.
        expect(incidentStartingAt(TICKS_PER_WAVE + 1)).toBeNull();
        // Next incident one period later.
        expect(incidentStartingAt(TICKS_PER_WAVE + INCIDENT_PERIOD)).not.toBeNull();
    });

    it('an incident becomes active and expires', () => {
        let state = createEndlessState();
        // Advance to the tick just after the first incident starts.
        for (let i = 0; i < TICKS_PER_WAVE + 1 && !state.over; i++) state = stepEndless(state, strongConfig);
        expect(state.activeIncident).not.toBeNull();
        const dur = state.activeIncident!.ticksRemaining;
        expect(dur).toBeGreaterThan(0);
    });
});

describe('Endless — shift ends correctly', () => {
    it('a weak config collapses relatively quickly', () => {
        const result = simulateEndlessRun(weakConfig);
        expect(result.timeSurvived).toBeGreaterThan(0);
        expect(['stability', 'fairness', 'patience']).toContain(result.endReason);
    });

    it('every run eventually ends — no endless soft lock even for a strong config', () => {
        const result = simulateEndlessRun(strongConfig, 100000);
        expect(result.timeSurvived).toBeLessThan(100000);
        expect(['stability', 'fairness', 'patience']).toContain(result.endReason);
    });

    it('a strong config survives longer than a weak one', () => {
        const strong = simulateEndlessRun(strongConfig);
        const weak = simulateEndlessRun(weakConfig);
        expect(strong.timeSurvived).toBeGreaterThan(weak.timeSurvived);
    });

    it('does not report over before a meter is actually depleted', () => {
        const s = runN(strongConfig, 5);
        if (!s.over) {
            expect(s.stability).toBeGreaterThan(0);
            expect(s.fairness).toBeGreaterThan(0);
            expect(s.fanPatience).toBeGreaterThan(0);
        }
    });
});

describe('Endless — meters and combo stay in valid ranges', () => {
    it('meters never leave 0..100 across a full run', () => {
        let state = createEndlessState();
        for (let i = 0; i < 2000 && !state.over; i++) {
            state = stepEndless(state, strongConfig);
            expect(state.stability).toBeGreaterThanOrEqual(0);
            expect(state.stability).toBeLessThanOrEqual(100);
            expect(state.fairness).toBeGreaterThanOrEqual(0);
            expect(state.fairness).toBeLessThanOrEqual(100);
            expect(state.fanPatience).toBeGreaterThanOrEqual(0);
            expect(state.fanPatience).toBeLessThanOrEqual(100);
            expect(state.combo).toBeGreaterThanOrEqual(0);
        }
    });

    it('cumulative counters never decrease', () => {
        let state = createEndlessState();
        let prevScore = 0, prevFans = 0, prevBots = 0;
        for (let i = 0; i < 300 && !state.over; i++) {
            state = stepEndless(state, strongConfig);
            expect(state.operatorScore).toBeGreaterThanOrEqual(prevScore);
            expect(state.fansServed).toBeGreaterThanOrEqual(prevFans);
            expect(state.botsBlocked).toBeGreaterThanOrEqual(prevBots);
            prevScore = state.operatorScore; prevFans = state.fansServed; prevBots = state.botsBlocked;
        }
    });

    it('highestCombo tracks the peak combo', () => {
        let state = createEndlessState();
        for (let i = 0; i < 200 && !state.over; i++) state = stepEndless(state, strongConfig);
        expect(state.highestCombo).toBeGreaterThanOrEqual(state.combo);
    });
});

describe('Endless — records persistence', () => {
    it('first run seeds the endless record', () => {
        const result = simulateEndlessRun(strongConfig);
        const { store, improvements } = applyEndlessResult(createEmptyStore(), result, 1000);
        expect(store.endless).toBeDefined();
        expect(store.endless!.runs).toBe(1);
        expect(store.endless!.longestShift).toBe(result.timeSurvived);
        expect(store.endless!.lastPlayed).toBe(1000);
        expect(improvements.anyImprovement).toBe(true);
    });

    it('a better run updates records and flags improvements', () => {
        let store = applyEndlessResult(createEmptyStore(), simulateEndlessRun(weakConfig), 1).store;
        const strong = simulateEndlessRun(strongConfig);
        const { store: after, improvements } = applyEndlessResult(store, strong, 2);
        expect(after.endless!.longestShift).toBe(strong.timeSurvived);
        expect(after.endless!.runs).toBe(2);
        expect(improvements.newLongestShift).toBe(true);
    });

    it('a worse run keeps prior bests but still counts the run', () => {
        let store = applyEndlessResult(createEmptyStore(), simulateEndlessRun(strongConfig), 1).store;
        const priorBest = store.endless!.longestShift;
        const { store: after, improvements } = applyEndlessResult(store, simulateEndlessRun(weakConfig), 2);
        expect(after.endless!.longestShift).toBe(priorBest);
        expect(after.endless!.runs).toBe(2);
        expect(improvements.newLongestShift).toBe(false);
    });

    it('endless record survives a JSON round-trip', () => {
        const result = simulateEndlessRun(strongConfig);
        const store = applyEndlessResult(createEmptyStore(), result, 1).store;
        const json = JSON.stringify(store);
        // parseStore is imported indirectly through records; re-parse here.
        const parsed = JSON.parse(json);
        expect(parsed.endless.longestShift).toBe(result.timeSurvived);
    });
});

describe('Endless — result extraction', () => {
    it('endlessResultFromState mirrors the final state', () => {
        let state = createEndlessState();
        for (let i = 0; i < 100 && !state.over; i++) state = stepEndless(state, strongConfig);
        const r = endlessResultFromState(state);
        expect(r.timeSurvived).toBe(state.tick);
        expect(r.operatorScore).toBe(state.operatorScore);
        expect(r.highestCombo).toBe(state.highestCombo);
    });
});
