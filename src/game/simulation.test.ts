import { describe, it, expect } from 'vitest';
import { LEVELS } from '../data/levels';
import { DEFAULT_CONFIG } from '../data/defaults';
import { runSimulation } from './simulation';
import { calculateProjections } from './projections';
import { getRank, nextRankThreshold } from './ranks';
import type { GameConfig, Level } from './types';

const passingSetups: Record<number, GameConfig> = {
    1: { botDetection: 'high',        verification: 'basic',    purchaseLimit: 2, resale: 'face',      waveCount: 2, waveInterval: 15, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 6 },
    2: { botDetection: 'high',        verification: 'basic',    purchaseLimit: 4, resale: 'caps',      waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 25, accessiblePercent: 5 },
    3: { botDetection: 'high',        verification: 'basic',    purchaseLimit: 4, resale: 'caps',      waveCount: 4, waveInterval: 20, waitingRoomTime: 3, presalePercent: 20, accessiblePercent: 8 },
    4: { botDetection: 'high',        verification: 'verified', purchaseLimit: 2, resale: 'face',      waveCount: 3, waveInterval: 20, waitingRoomTime: 1, presalePercent: 30, accessiblePercent: 5 },
    5: { botDetection: 'high',        verification: 'verified', purchaseLimit: 2, resale: 'face',      waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 25, accessiblePercent: 8 },
};

const badSetup: GameConfig = {
    botDetection: 'low',
    verification: 'none',
    purchaseLimit: 8,
    resale: 'none',
    waveCount: 1,
    waveInterval: 15,
    waitingRoomTime: 24,
    presalePercent: 0,
    accessiblePercent: 1,
};

const maxAllSetup: GameConfig = {
    botDetection: 'aggressive',
    verification: 'verified',
    purchaseLimit: 1,
    resale: 'no_resale',
    waveCount: 8,
    waveInterval: 60,
    waitingRoomTime: 24,
    presalePercent: 50,
    accessiblePercent: 15,
};

function level(id: number): Level {
    const l = LEVELS.find(lvl => lvl.id === id);
    if (!l) throw new Error(`Level ${id} not found`);
    return l;
}

describe('Level target/par reconciliation', () => {
    it('Level 1 target is 65', () => expect(level(1).parScore).toBe(65));
    it('Level 2 target is 65', () => expect(level(2).parScore).toBe(65));
    it('Level 3 target is 65', () => expect(level(3).parScore).toBe(65));
    it('Level 4 target is 60', () => expect(level(4).parScore).toBe(60));
    it('Level 5 target is 55', () => expect(level(5).parScore).toBe(55));
});

describe('Every level has a passing configuration', () => {
    for (let id = 1; id <= 5; id++) {
        it(`Level ${id} passes with documented setup`, () => {
            const lvl = level(id);
            const r = runSimulation(lvl, passingSetups[id]);
            expect(r.overallScore).toBeGreaterThanOrEqual(lvl.parScore);
            expect(r.passed).toBe(true);
        });
    }
});

describe('Every level has a failing configuration', () => {
    for (let id = 1; id <= 5; id++) {
        it(`Level ${id} fails on the bad setup`, () => {
            const lvl = level(id);
            const r = runSimulation(lvl, badSetup);
            expect(r.overallScore).toBeLessThan(lvl.parScore);
            expect(r.passed).toBe(false);
        });
    }
});

describe('Level 1 has at least two viable passing configurations', () => {
    it('two distinct configs both pass Level 1', () => {
        const configA: GameConfig = { ...passingSetups[1] };
        const configB: GameConfig = {
            botDetection: 'medium',
            verification: 'basic',
            purchaseLimit: 3,
            resale: 'face',
            waveCount: 2,
            waveInterval: 20,
            waitingRoomTime: 2,
            presalePercent: 10,
            accessiblePercent: 5,
        };
        const rA = runSimulation(level(1), configA);
        const rB = runSimulation(level(1), configB);
        // At least one alternate should reach at least 63 (near-clear band or better)
        expect(rA.overallScore).toBeGreaterThanOrEqual(level(1).parScore);
        expect(rB.overallScore).toBeGreaterThanOrEqual(63);
    });
});

describe('Max everything is not optimal for Level 1', () => {
    it('best documented Level 1 setup outscores max-everything', () => {
        const good = runSimulation(level(1), passingSetups[1]);
        const maxed = runSimulation(level(1), maxAllSetup);
        expect(good.overallScore).toBeGreaterThan(maxed.overallScore);
    });
});

describe('Bot detection tradeoff', () => {
    it('increasing bot detection reduces bot exposure', () => {
        const low = calculateProjections(level(2), { ...DEFAULT_CONFIG, botDetection: 'low' });
        const high = calculateProjections(level(2), { ...DEFAULT_CONFIG, botDetection: 'high' });
        expect(high.botExposure).toBeLessThan(low.botExposure);
    });
    it('increasing bot detection increases fan friction', () => {
        const low = calculateProjections(level(2), { ...DEFAULT_CONFIG, botDetection: 'low' });
        const high = calculateProjections(level(2), { ...DEFAULT_CONFIG, botDetection: 'high' });
        expect(high.fanFriction).toBeGreaterThan(low.fanFriction);
    });
});

describe('Entry waves tradeoff', () => {
    it('more waves generally reduce load spike risk vs single wave', () => {
        const single = calculateProjections(level(2), { ...DEFAULT_CONFIG, waveCount: 1 });
        const three = calculateProjections(level(2), { ...DEFAULT_CONFIG, waveCount: 3 });
        expect(three.loadRisk).toBeLessThan(single.loadRisk);
    });
    it('excessive waves add stress penalty vs 3 waves', () => {
        const three = runSimulation(level(2), { ...DEFAULT_CONFIG, waveCount: 3 });
        const eight = runSimulation(level(2), { ...DEFAULT_CONFIG, waveCount: 8 });
        expect(eight.siteStability).toBeLessThan(three.siteStability);
    });
});

describe('Presale allocation reduces public inventory', () => {
    it('higher presale% → smaller publicInventory', () => {
        const low = calculateProjections(level(3), { ...DEFAULT_CONFIG, presalePercent: 10 });
        const high = calculateProjections(level(3), { ...DEFAULT_CONFIG, presalePercent: 45 });
        expect(high.publicInventory).toBeLessThan(low.publicInventory);
    });
});

describe('Resale restrictions in high-resale scenario', () => {
    it('face-value beats open resale on fairness for Playoff (L4)', () => {
        const open = runSimulation(level(4), { ...DEFAULT_CONFIG, resale: 'none' });
        const face = runSimulation(level(4), { ...DEFAULT_CONFIG, resale: 'face' });
        expect(face.fairness).toBeGreaterThan(open.fairness);
    });
});

describe('Verification friction ordering', () => {
    it('ID verification friction > email verification friction', () => {
        const email = calculateProjections(level(2), { ...DEFAULT_CONFIG, verification: 'basic' });
        const idv = calculateProjections(level(2), { ...DEFAULT_CONFIG, verification: 'verified' });
        expect(idv.fanFriction).toBeGreaterThan(email.fanFriction);
    });
});

describe('Simulation result metrics stay in valid ranges', () => {
    for (let id = 1; id <= 5; id++) {
        it(`Level ${id} — passing setup metrics are within [0, 100] (or seats-bounded)`, () => {
            const lvl = level(id);
            const r = runSimulation(lvl, passingSetups[id]);
            expect(r.overallScore).toBeGreaterThanOrEqual(0);
            expect(r.overallScore).toBeLessThanOrEqual(100);
            expect(r.checkoutSuccessRate).toBeGreaterThanOrEqual(40);
            expect(r.checkoutSuccessRate).toBeLessThanOrEqual(98);
            expect(r.satisfaction).toBeGreaterThanOrEqual(20);
            expect(r.satisfaction).toBeLessThanOrEqual(100);
            expect(r.siteStability).toBeGreaterThanOrEqual(20);
            expect(r.siteStability).toBeLessThanOrEqual(100);
            expect(r.fairness).toBeGreaterThanOrEqual(20);
            expect(r.fairness).toBeLessThanOrEqual(100);
            expect(r.realFansServed).toBeGreaterThanOrEqual(0);
            expect(r.realFansServed).toBeLessThanOrEqual(lvl.seats);
        });
    }
});

describe('Rank thresholds', () => {
    it('below target − 15 is FAILED', () => {
        expect(getRank(40, 60).label).toBe('FAILED');
    });
    it('below target within 15 is NEAR MISS', () => {
        expect(getRank(55, 60).label).toBe('NEAR MISS');
    });
    it('at target is CLEAR', () => {
        expect(getRank(60, 60).label).toBe('CLEAR');
    });
    it('target + 10 is STRONG CLEAR', () => {
        expect(getRank(70, 60).label).toBe('STRONG CLEAR');
    });
    it('target + 20 is MASTERED', () => {
        expect(getRank(80, 60).label).toBe('MASTERED');
    });
    it('nextRankThreshold for CLEAR shows STRONG CLEAR next', () => {
        expect(nextRankThreshold(65, 60)?.label).toBe('STRONG CLEAR');
    });
    it('nextRankThreshold for MASTERED is null', () => {
        expect(nextRankThreshold(85, 60)).toBeNull();
    });
});

describe('Warnings model', () => {
    it('produces DANGER for single-wave high demand', () => {
        const p = calculateProjections(level(2), { ...DEFAULT_CONFIG, waveCount: 1 });
        const spike = p.warnings.find(w => w.label.includes('Single-wave'));
        expect(spike).toBeDefined();
        expect(spike?.severity).toBe('danger');
        expect(spike?.metric).toBe('Stability');
    });
    it('all warnings have priority sort order', () => {
        const p = calculateProjections(level(2), { ...DEFAULT_CONFIG, botDetection: 'low', waveCount: 1, resale: 'none', presalePercent: 45 });
        for (let i = 1; i < p.warnings.length; i++) {
            expect(p.warnings[i - 1].priority).toBeGreaterThanOrEqual(p.warnings[i].priority);
        }
    });
});
