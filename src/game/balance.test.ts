import { describe, it, expect } from 'vitest';
import {
    RANK, ENDLESS, DECISION, ALERT, SIM, UI,
    BOT_DETECTION_EFFECTIVENESS, VERIFICATION_EFFECTIVENESS,
    RESALE_FAIRNESS, ENDLESS_RESALE_FAIRNESS,
} from './balance';
import { STRONG_CLEAR_DELTA, MASTER_DELTA } from './ranks';
import { TICKS_PER_WAVE, INCIDENT_PERIOD, MAX_SURVIVAL } from './endless';
import { DECISION_PERIOD, DECISION_TIMEOUT, EFFECT_DURATION } from './decisions';

// These are pinned-value tests. Their job is NOT to re-derive the balance, but to
// FAIL LOUDLY if a value drifts unintentionally during a refactor — and to force a
// deliberate update (with playtest justification) when tuning. Update the expected
// numbers here in the same commit you tune balance.ts.
describe('balance config — pinned values (guard against accidental drift)', () => {
    it('rank bands', () => {
        expect(RANK.strongClearDelta).toBe(6);
        expect(RANK.masterDelta).toBe(12);
        expect(RANK.failDelta).toBe(-12);
    });
    it('endless cadence & scaling anchors', () => {
        expect(ENDLESS.ticksPerWave).toBe(45);
        expect(ENDLESS.incidentPeriod).toBe(20);
        expect(ENDLESS.maxSurvival).toBe(100);
        expect(ENDLESS.comboMultCap).toBe(0.5);
        expect(ENDLESS.deltaClampMin).toBe(-3.5);
        expect(ENDLESS.deltaClampMax).toBe(2);
    });
    it('decision cadence', () => {
        expect(DECISION.period).toBe(60);
        expect(DECISION.timeout).toBe(10);
        expect(DECISION.effectDuration).toBe(25);
        expect(DECISION.firstOffset).toBe(30);
    });
    it('lever effectiveness anchors', () => {
        expect(BOT_DETECTION_EFFECTIVENESS.aggressive).toBe(0.94);
        expect(VERIFICATION_EFFECTIVENESS.verified).toBe(0.75);
        expect(RESALE_FAIRNESS.face).toBe(12);
        expect(ENDLESS_RESALE_FAIRNESS.face).toBe(0.12);
    });
    it('key alert thresholds', () => {
        expect(ALERT.botExposureHigh).toBe(55);
        expect(ALERT.fanFrictionCritical).toBe(30);
        expect(ALERT.singleWaveBaseLoad).toBe(4);
    });
    it('a few sim scoring anchors', () => {
        expect(SIM.maxBotBlock).toBe(0.98);
        expect(SIM.satisfactionBase).toBe(62);
        expect(SIM.fairnessBase).toBe(58);
        expect(SIM.stabilityBase).toBe(128);
    });
    it('UI timing anchors', () => {
        expect(UI.endlessTickMs).toBe(1000);
        expect(UI.pressureCountdownStart).toBe(180);
    });
});

describe('balance config — single source of truth', () => {
    // Modules must re-export the SAME values as balance.ts (no divergent copies).
    it('ranks.ts deltas mirror balance.RANK', () => {
        expect(STRONG_CLEAR_DELTA).toBe(RANK.strongClearDelta);
        expect(MASTER_DELTA).toBe(RANK.masterDelta);
    });
    it('endless.ts constants mirror balance.ENDLESS', () => {
        expect(TICKS_PER_WAVE).toBe(ENDLESS.ticksPerWave);
        expect(INCIDENT_PERIOD).toBe(ENDLESS.incidentPeriod);
        expect(MAX_SURVIVAL).toBe(ENDLESS.maxSurvival);
    });
    it('decisions.ts constants mirror balance.DECISION', () => {
        expect(DECISION_PERIOD).toBe(DECISION.period);
        expect(DECISION_TIMEOUT).toBe(DECISION.timeout);
        expect(EFFECT_DURATION).toBe(DECISION.effectDuration);
    });
});
