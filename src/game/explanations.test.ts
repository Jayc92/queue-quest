import { describe, it, expect } from 'vitest';
import { LEVELS } from '../data/levels';
import { runSimulation } from './simulation';
import { applyScenario } from './scenario';
import { analyzeMetricCauses, summarizeRun, type MetricExplanation, type LeverId } from './explanations';
import type { GameConfig, Level } from './types';

function level(id: number): Level {
    return LEVELS.find(l => l.id === id)!;
}

function analyze(lvl: Level, config: GameConfig): MetricExplanation[] {
    const result = runSimulation(applyScenario(lvl), config);
    return analyzeMetricCauses(lvl, config, result);
}

const baseline: GameConfig = { botDetection: 'high', verification: 'basic', purchaseLimit: 2, resale: 'face', waveCount: 3, waveInterval: 20, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 8 };

describe('analyzeMetricCauses — completeness', () => {
    const all = analyze(level(2), baseline);

    it('covers all six result metrics exactly once', () => {
        expect(all.map(e => e.id).sort()).toEqual(['bots', 'checkout', 'fairness', 'fans', 'satisfaction', 'stability']);
    });

    it('every metric has a plain-language definition and a recommendation', () => {
        for (const e of all) {
            expect(e.definition.length).toBeGreaterThan(30);
            expect(e.recommendation.length).toBeGreaterThan(10);
            expect(e.display.length).toBeGreaterThan(0);
            expect(['good', 'warning', 'danger']).toContain(e.tone);
        }
    });

    it('every metric surfaces at least one factor, ranked by weight', () => {
        for (const e of all) {
            expect(e.positiveFactors.length + e.negativeFactors.length).toBeGreaterThan(0);
            for (const list of [e.positiveFactors, e.negativeFactors]) {
                for (let i = 1; i < list.length; i++) {
                    expect(list[i - 1].weight).toBeGreaterThanOrEqual(list[i].weight);
                }
            }
        }
    });

    it('is deterministic — same inputs produce identical output', () => {
        const a = JSON.stringify(analyze(level(3), baseline));
        const b = JSON.stringify(analyze(level(3), baseline));
        expect(a).toBe(b);
    });
});

describe('analyzeMetricCauses — truthful lever attribution', () => {
    it('Bots Blocked factors only ever cite detection or verification (the only levers the model uses)', () => {
        const configs: GameConfig[] = [
            baseline,
            { ...baseline, botDetection: 'low', verification: 'none' },
            { ...baseline, botDetection: 'aggressive', verification: 'verified', waitingRoomTime: 24, waveCount: 8, presalePercent: 50 },
        ];
        const allowed: LeverId[] = ['botDetection', 'verification'];
        for (const cfg of configs) {
            const bots = analyze(level(2), cfg).find(e => e.id === 'bots')!;
            for (const f of [...bots.positiveFactors, ...bots.negativeFactors]) {
                expect(allowed).toContain(f.lever);
            }
        }
    });

    it('Checkout factors never cite resale/presale/accessibility (not in the checkout model)', () => {
        const forbidden: LeverId[] = ['resale', 'presalePercent', 'accessiblePercent', 'waitingRoomTime'];
        const checkout = analyze(level(2), { ...baseline, resale: 'none', presalePercent: 50, accessiblePercent: 1 }).find(e => e.id === 'checkout')!;
        for (const f of [...checkout.positiveFactors, ...checkout.negativeFactors]) {
            expect(forbidden).not.toContain(f.lever);
        }
    });
});

describe('analyzeMetricCauses — known cause/effect pairs', () => {
    it('Enhanced bot detection is credited as helping Bots Blocked', () => {
        const bots = analyze(level(2), baseline).find(e => e.id === 'bots')!;
        expect(bots.positiveFactors.some(f => f.lever === 'botDetection' && /Enhanced/.test(f.label))).toBe(true);
    });

    it('weak bot defense is blamed on Bots Blocked with a raise-detection fix', () => {
        const bots = analyze(level(2), { ...baseline, botDetection: 'low', verification: 'none' }).find(e => e.id === 'bots')!;
        const blame = bots.negativeFactors.find(f => f.lever === 'botDetection');
        expect(blame).toBeDefined();
        expect(blame!.fix).toMatch(/Raise Bot Detection/i);
        expect(bots.recommendation).toMatch(/Raise Bot Detection/i);
    });

    it('aggressive screening / ID verification hurts Satisfaction with friction cited', () => {
        const sat = analyze(level(1), { ...baseline, botDetection: 'aggressive', verification: 'verified' }).find(e => e.id === 'satisfaction')!;
        expect(sat.negativeFactors.some(f => /friction/i.test(f.label) || /friction/i.test(f.detail))).toBe(true);
        expect(sat.negativeFactors.some(f => f.lever === 'verification' && /ID/i.test(f.label))).toBe(true);
    });

    it('2–4 entry waves are credited as helping Stability; a single wave is blamed', () => {
        const multi = analyze(level(2), baseline).find(e => e.id === 'stability')!;
        expect(multi.positiveFactors.some(f => f.lever === 'waveCount')).toBe(true);
        const single = analyze(level(2), { ...baseline, waveCount: 1 }).find(e => e.id === 'stability')!;
        const blame = single.negativeFactors.find(f => f.lever === 'waveCount');
        expect(blame).toBeDefined();
        expect(blame!.fix).toMatch(/2–4 waves/);
    });

    it('excessive waves are blamed on Stability and Checkout', () => {
        const many = analyze(level(2), { ...baseline, waveCount: 8 });
        const stab = many.find(e => e.id === 'stability')!;
        expect(stab.negativeFactors.some(f => f.lever === 'waveCount' && /8 waves/i.test(f.label))).toBe(true);
        const checkout = many.find(e => e.id === 'checkout')!;
        expect(checkout.negativeFactors.some(f => f.lever === 'waveCount')).toBe(true);
    });

    it('high presale allocation is blamed on Fairness', () => {
        const fair = analyze(level(3), { ...baseline, presalePercent: 45 }).find(e => e.id === 'fairness')!;
        const blame = fair.negativeFactors.find(f => f.lever === 'presalePercent');
        expect(blame).toBeDefined();
        expect(blame!.fix).toMatch(/presale/i);
    });

    it('face-value resale is credited on Fairness in the resale-heavy Playoff mission', () => {
        const fair = analyze(level(4), baseline).find(e => e.id === 'fairness')!;
        const credit = fair.positiveFactors.find(f => f.lever === 'resale');
        expect(credit).toBeDefined();
        expect(credit!.detail).toMatch(/resale pressure/i);   // notes the pressure context
    });

    it('open resale is blamed on Fairness under high resale pressure', () => {
        const fair = analyze(level(4), { ...baseline, resale: 'none' }).find(e => e.id === 'fairness')!;
        const blame = fair.negativeFactors.find(f => f.lever === 'resale');
        expect(blame).toBeDefined();
        expect(blame!.fix).toMatch(/Face Value|Cap/);
    });

    it('long waiting rooms are blamed on Fans Served via bot preparation', () => {
        const fans = analyze(level(2), { ...baseline, waitingRoomTime: 12 }).find(e => e.id === 'fans')!;
        expect(fans.negativeFactors.some(f => f.lever === 'waitingRoomTime')).toBe(true);
    });

    it('a scenario event that raises server risk is cited on Stability (Arena surge)', () => {
        // L2's scenario multiplies server risk — the explanation should name it.
        const stab = analyze(level(2), baseline).find(e => e.id === 'stability')!;
        expect(stab.negativeFactors.some(f => f.lever === 'scenario')).toBe(true);
    });
});

describe('summarizeRun — headline causal summary', () => {
    it('produces a top positive, an actionable top negative, and one recommendation', () => {
        const exps = analyze(level(2), { ...baseline, botDetection: 'low', waveCount: 1 });
        const s = summarizeRun(exps, level(2));
        expect(s.topPositive.factor.label.length).toBeGreaterThan(0);
        expect(s.topNegative).not.toBeNull();
        expect(s.topNegative!.factor.fix).toBeDefined();   // actionable, not raw context
        expect(s.recommendation.length).toBeGreaterThan(10);
    });

    it('never headlines unfixable context (raw demand) as the top negative', () => {
        for (const id of [1, 2, 3, 4, 5]) {
            const exps = analyze(level(id), baseline);
            const s = summarizeRun(exps, level(id));
            if (s.topNegative) expect(s.topNegative.factor.lever).not.toBe('demand');
        }
    });
});
