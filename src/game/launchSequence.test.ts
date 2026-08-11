import { describe, it, expect } from 'vitest';
import { LEVELS } from '../data/levels';
import { runSimulation } from './simulation';
import { calculateProjections } from './projections';
import { applyScenario } from './scenario';
import { generateDailyChallenge } from './daily';
import { buildLaunchSequence, LAUNCH_TIMING } from './launchSequence';
import type { GameConfig, Level } from './types';

function level(id: number): Level {
    return LEVELS.find(l => l.id === id)!;
}

// Build the model exactly the way the screen does: effective level + real result.
function modelFor(lvl: Level, config: GameConfig) {
    const eff = applyScenario(lvl);
    const result = runSimulation(eff, config);
    const projections = calculateProjections(eff, config);
    return { model: buildLaunchSequence(eff, config, projections, result), result };
}

const base: GameConfig = {
    botDetection: 'high', verification: 'basic', purchaseLimit: 2, resale: 'face',
    waveCount: 3, waveInterval: 20, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 6,
};

describe('launch sequence — bot filter reflects the actual defense', () => {
    it('strong detection blocks visibly more than weak detection and does not leak', () => {
        const strong = modelFor(level(2), { ...base, botDetection: 'high' });
        const weak = modelFor(level(2), { ...base, botDetection: 'low', verification: 'none' });
        expect(strong.model.botBlockedPct).toBeGreaterThan(weak.model.botBlockedPct);
        expect(strong.model.botLeaked).toBe(false);
        expect(strong.model.botTone).toBe('good');
        expect(weak.model.botLeaked).toBe(true);
        expect(weak.model.botTone).toBe('danger');
        // The phase copy tells the same story it will tell in the debrief.
        const strongCopy = strong.model.phases.find(p => p.id === 'botfilter')!.detail;
        const weakCopy = weak.model.phases.find(p => p.id === 'botfilter')!.detail;
        expect(strongCopy).toMatch(/holding|contained/i);
        expect(weakCopy).toMatch(/leak|punching/i);
    });
});

describe('launch sequence — wave release reflects load reality', () => {
    it('a single wave shows a bigger server spike than organized waves', () => {
        const single = modelFor(level(1), { ...base, waveCount: 1 });
        const multi = modelFor(level(1), { ...base, waveCount: 3 });
        expect(single.model.serverLoadPct).toBeGreaterThan(multi.model.serverLoadPct);
        expect(single.model.waveStyle).toBe('single-surge');
        expect(multi.model.waveStyle).toBe('organized');
        expect(single.model.phases.find(p => p.id === 'waves')!.label).toBe('SINGLE-WAVE RELEASE');
        expect(multi.model.phases.find(p => p.id === 'waves')!.label).toBe('ENTRY WAVES RELEASED');
    });

    it('a genuinely stable run never shows false critical-server messaging', () => {
        // Well-staggered small-venue run: high stability by construction.
        const { model, result } = modelFor(level(1), { ...base, waveCount: 4, waveInterval: 60 });
        expect(result.siteStability).toBeGreaterThanOrEqual(60);   // sanity: this run IS stable
        expect(model.serverCritical).toBe(false);
        for (const p of model.phases) expect(p.detail).not.toMatch(/CRITICAL/);
    });
});

describe('launch sequence — checkout & friction states', () => {
    it('a low-checkout run shows visible checkout failures', () => {
        // Max friction + single wave on a heavy level crushes checkout.
        const harsh: GameConfig = { ...base, botDetection: 'aggressive', verification: 'verified', waveCount: 1 };
        const { model, result } = modelFor(level(5), harsh);
        expect(result.checkoutSuccessRate).toBeLessThan(65);       // sanity: checkout IS struggling
        expect(model.checkoutStruggling).toBe(true);
        expect(model.phases.find(p => p.id === 'checkout')!.detail).toMatch(/failures/i);
    });

    it('a healthy run reads as controlled at checkout', () => {
        const { model, result } = modelFor(level(1), base);
        expect(model.checkoutStruggling).toBe(result.checkoutSuccessRate < 65);
        if (!model.checkoutStruggling && !model.frictionSlow) {
            expect(model.phases.find(p => p.id === 'checkout')!.detail).toMatch(/cleanly/i);
        }
    });
});

describe('launch sequence — Daily Challenge context', () => {
    it('uses the generated venue and demand, small club through huge stadium', () => {
        for (const key of ['2026-03-15', '2026-07-04', '2026-11-11']) {
            const daily = generateDailyChallenge(key);
            const { model } = modelFor(daily.level, base);
            expect(model.venueName).toBe(daily.venueName);
            expect(model.demand).toBe(daily.demand);
            expect(model.seats).toBe(daily.capacity);
            expect(model.phases[0].detail).toContain(daily.venueName);
            expect(model.demandDisplay).toBe(daily.demand.toLocaleString('en-US'));
        }
    });
});

describe('launch sequence — determinism & reveal discipline', () => {
    it('is deterministic for identical inputs', () => {
        const a = modelFor(level(3), base).model;
        const b = modelFor(level(3), base).model;
        expect(a).toEqual(b);
    });

    it('never exposes the final score before the Results reveal', () => {
        const { model, result } = modelFor(level(2), base);
        // No score-shaped field anywhere in the model…
        expect(JSON.stringify(model)).not.toContain('overallScore');
        // …and no phase copy mentions the score or its value.
        for (const p of model.phases) {
            expect(p.label + p.detail).not.toMatch(/\bscore\b/i);
            expect(p.detail).not.toContain(` ${result.overallScore} `);
        }
    });

    it('total duration sits in the 3.5–5s anticipation band', () => {
        const { model } = modelFor(level(1), base);
        expect(model.totalMs).toBeGreaterThanOrEqual(3500);
        expect(model.totalMs).toBeLessThanOrEqual(5000);
        expect(model.totalMs).toBe(Object.values(LAUNCH_TIMING).reduce((s, v) => s + v, 0));
    });

    it('tickets countdown is inventory, derived from the real run, never negative', () => {
        const { model, result } = modelFor(level(4), base);
        expect(model.ticketsStart).toBe(applyScenario(level(4)).seats);
        expect(model.ticketsEnd).toBe(Math.max(0, model.ticketsStart - result.realFansServed - result.botTickets));
        expect(model.ticketsEnd).toBeGreaterThanOrEqual(0);
    });
});
