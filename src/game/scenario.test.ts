import { describe, it, expect } from 'vitest';
import { LEVELS } from '../data/levels';
import { applyScenario } from './scenario';
import { runSimulation } from './simulation';
import type { GameConfig, Level } from './types';

function level(id: number): Level {
    const l = LEVELS.find(lvl => lvl.id === id);
    if (!l) throw new Error(`Level ${id} not found`);
    return l;
}

const baselineConfig: GameConfig = {
    botDetection: 'medium', verification: 'basic', purchaseLimit: 4, resale: 'caps',
    waveCount: 3, waveInterval: 20, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 5,
};

describe('Scenario modifiers — deterministic identity', () => {
    it('every level has exactly one scenario modifier', () => {
        for (const l of LEVELS) {
            expect(l.identity.scenario).toBeDefined();
            expect(typeof l.identity.scenario.id).toBe('string');
            expect(l.identity.scenario.id.length).toBeGreaterThan(0);
        }
    });

    it('applyScenario is deterministic — same input, same output', () => {
        const a = applyScenario(level(2));
        const b = applyScenario(level(2));
        expect(a).toEqual(b);
    });

    it('Level 1 (calm) does not change effective parameters', () => {
        const base = level(1);
        const eff = applyScenario(base);
        expect(eff.serverRisk).toBe(base.serverRisk);
        expect(eff.botPressure).toBe(base.botPressure);
        expect(eff.resalePressure).toBe(base.resalePressure);
        expect(eff.demand).toBe(base.demand);
    });

    it('Arena traffic surge raises server risk and demand', () => {
        const base = level(2);
        const eff = applyScenario(base);
        expect(eff.serverRisk).toBeGreaterThan(base.serverRisk);
        expect(eff.demand).toBeGreaterThan(base.demand);
    });

    it('Playoff scalper activity raises resale and bot pressure', () => {
        const base = level(4);
        const eff = applyScenario(base);
        expect(eff.resalePressure).toBeGreaterThan(base.resalePressure);
        expect(eff.botPressure).toBeGreaterThan(base.botPressure);
    });

    it('Mega second bot wave raises bot pressure, server risk, and demand', () => {
        const base = level(5);
        const eff = applyScenario(base);
        expect(eff.botPressure).toBeGreaterThan(base.botPressure);
        expect(eff.serverRisk).toBeGreaterThan(base.serverRisk);
        expect(eff.demand).toBeGreaterThan(base.demand);
    });

    it('clamps pressures to the 0..1 range', () => {
        const eff = applyScenario(level(5));
        for (const v of [eff.botPressure, eff.resalePressure, eff.serverRisk]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    it('preserves identity, weights, parScore and id through the modifier', () => {
        const base = level(3);
        const eff = applyScenario(base);
        expect(eff.id).toBe(base.id);
        expect(eff.parScore).toBe(base.parScore);
        expect(eff.weights).toEqual(base.weights);
        expect(eff.identity).toBe(base.identity);
    });

    it('scenario influences the simulation — surge lowers or equals score vs. base', () => {
        // Arena surge should make the same config no easier than the un-modified level.
        const base = level(2);
        const eff = applyScenario(base);
        const baseScore = runSimulation(base, baselineConfig).overallScore;
        const effScore = runSimulation(eff, baselineConfig).overallScore;
        expect(effScore).toBeLessThanOrEqual(baseScore);
    });

    it('levels still pass through their scenario with a strong config', () => {
        // The documented strong setups should still clear the scenario-adjusted level.
        const strong: Record<number, GameConfig> = {
            1: { botDetection: 'high', verification: 'basic', purchaseLimit: 2, resale: 'face', waveCount: 2, waveInterval: 15, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 6 },
            2: { botDetection: 'high', verification: 'basic', purchaseLimit: 4, resale: 'caps', waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 25, accessiblePercent: 5 },
            3: { botDetection: 'high', verification: 'basic', purchaseLimit: 4, resale: 'caps', waveCount: 4, waveInterval: 20, waitingRoomTime: 3, presalePercent: 20, accessiblePercent: 8 },
            4: { botDetection: 'high', verification: 'verified', purchaseLimit: 2, resale: 'face', waveCount: 3, waveInterval: 20, waitingRoomTime: 1, presalePercent: 30, accessiblePercent: 5 },
            5: { botDetection: 'high', verification: 'verified', purchaseLimit: 2, resale: 'face', waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 25, accessiblePercent: 8 },
        };
        for (let id = 1; id <= 5; id++) {
            const eff = applyScenario(level(id));
            const r = runSimulation(eff, strong[id]);
            expect(r.overallScore, `Level ${id} should still be passable under its scenario`).toBeGreaterThanOrEqual(eff.parScore);
        }
    });
});

describe('Mission identity metadata', () => {
    it('every level exposes a complete identity', () => {
        for (const l of LEVELS) {
            const id = l.identity;
            expect(id.threatLevel).toBeTruthy();
            expect(id.primaryConcern).toBeTruthy();
            expect(id.missionType).toBeTruthy();
            expect(id.briefing.situation).toBeTruthy();
            expect(id.briefing.threatAssessment).toBeTruthy();
            expect(id.briefing.operationalGoal).toBeTruthy();
            expect(id.briefing.knownRisks.length).toBeGreaterThan(0);
            expect(id.briefing.successCriteria).toBeTruthy();
            expect(id.resultSummary.strong).toBeTruthy();
            expect(id.resultSummary.pass).toBeTruthy();
            expect(id.resultSummary.fail).toBeTruthy();
        }
    });

    it('threat levels escalate across the campaign', () => {
        const order = ['Low', 'Moderate', 'High', 'Severe', 'Critical'];
        const threats = LEVELS.map(l => l.identity.threatLevel);
        // The final mission should be the most severe; the first the least.
        expect(order.indexOf(threats[4])).toBeGreaterThan(order.indexOf(threats[0]));
        expect(threats[4]).toBe('Critical');
        expect(threats[0]).toBe('Low');
    });

    it('mission types are distinct per level', () => {
        const types = LEVELS.map(l => l.identity.missionType);
        expect(new Set(types).size).toBe(types.length);
    });

    it('primary concerns are distinct per level', () => {
        const concerns = LEVELS.map(l => l.identity.primaryConcern);
        expect(new Set(concerns).size).toBe(concerns.length);
    });
});
