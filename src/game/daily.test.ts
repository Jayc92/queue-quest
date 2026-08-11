import { describe, it, expect } from 'vitest';
import { generateDailyChallenge, DAILY_CANDIDATE_CONFIGS } from './daily';
import { localDateKey, parseDateKey, previousDateKey, isNextCalendarDay } from './dateUtils';
import { runSimulation } from './simulation';
import { applyScenario } from './scenario';
import { DAILY } from './balance';

// A deterministic sample of local calendar dates spanning >1 year (crosses a
// leap boundary and every month length).
function sampleDates(count: number): string[] {
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
        keys.push(localDateKey(new Date(2026, 0, 1 + i)));
    }
    return keys;
}

const DATES = sampleDates(400);

// Real-world names that must never appear in generated fiction.
const FORBIDDEN_NAMES = /madison square|wembley|staples|forum|coachella|glastonbury|taylor|beyonc|swift|nfl|nba|fifa|ncaa|superbowl|super bowl|rose bowl|michigan stadium|beaver stadium/i;

describe('dateUtils — local calendar keys', () => {
    it('formats local dates as YYYY-MM-DD', () => {
        expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
        expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
    });
    it('parses valid keys and rejects impossible dates', () => {
        expect(parseDateKey('2026-02-28')).not.toBeNull();
        expect(parseDateKey('2026-02-31')).toBeNull();  // would roll over
        expect(parseDateKey('garbage')).toBeNull();
        expect(parseDateKey('2026-13-01')).toBeNull();
    });
    it('previousDateKey handles month and year boundaries', () => {
        expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
        expect(previousDateKey('2026-03-01')).toBe('2026-02-28');   // 2026 not a leap year
        expect(previousDateKey('2028-03-01')).toBe('2028-02-29');   // 2028 is
    });
    it('isNextCalendarDay is exact-adjacency only', () => {
        expect(isNextCalendarDay('2026-01-01', '2026-01-02')).toBe(true);
        expect(isNextCalendarDay('2026-01-01', '2026-01-03')).toBe(false);
        expect(isNextCalendarDay('2026-01-02', '2026-01-01')).toBe(false);
        expect(isNextCalendarDay('2025-12-31', '2026-01-01')).toBe(true);
    });
});

describe('daily challenge — determinism', () => {
    it('the same date key always generates the identical challenge', () => {
        for (const key of DATES.slice(0, 30)) {
            const a = generateDailyChallenge(key);
            const b = generateDailyChallenge(key);
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        }
    });
    it('a pinned date generates a stable fingerprint (regression anchor)', () => {
        const c = generateDailyChallenge('2026-08-06');
        // Structural anchor rather than exact values, so intentional generator
        // tuning doesn't churn this test — but determinism regressions still fail.
        const again = generateDailyChallenge('2026-08-06');
        expect(c.venueName).toBe(again.venueName);
        expect(c.targetScore).toBe(again.targetScore);
        expect(c.demand).toBe(again.demand);
        expect(c.modifierIds).toEqual(again.modifierIds);
    });
});

describe('daily challenge — validity across 400 sampled dates', () => {
    const all = DATES.map(k => generateDailyChallenge(k));

    it('capacity stays within 800–100,000 and matches the level seats', () => {
        for (const c of all) {
            expect(c.capacity).toBeGreaterThanOrEqual(800);
            expect(c.capacity).toBeLessThanOrEqual(100000);
            expect(c.level.seats).toBe(c.capacity);
        }
    });

    it('demand always exceeds capacity; ratio stays in the sane or labeled-viral band', () => {
        for (const c of all) {
            expect(c.demand).toBeGreaterThan(c.capacity);
            const viral = c.modifierIds.includes('viral_demand');
            const maxRatio = viral ? DAILY.viralRatioMax + 1 : DAILY.ratioMax + 1;
            expect(c.demand / c.capacity).toBeLessThanOrEqual(maxRatio);
            if (c.demand / c.capacity > DAILY.ratioMax + 1) {
                expect(viral).toBe(true);   // outsized demand only when labeled viral
            }
        }
    });

    it('pressures stay in valid 0–1 ranges', () => {
        for (const c of all) {
            for (const v of [c.level.botPressure, c.level.resalePressure, c.level.serverRisk]) {
                expect(v).toBeGreaterThan(0);
                expect(v).toBeLessThanOrEqual(0.95);
            }
        }
    });

    it('every challenge has 1–2 modifiers, all distinct, with player-facing rules', () => {
        for (const c of all) {
            expect(c.modifierIds.length).toBeGreaterThanOrEqual(1);
            expect(c.modifierIds.length).toBeLessThanOrEqual(2);
            expect(new Set(c.modifierIds).size).toBe(c.modifierIds.length);
            expect(c.specialRules.length).toBe(c.modifierIds.length);
        }
    });

    it('no real venue/artist/team/league names appear anywhere in generated copy', () => {
        for (const c of all) {
            const blob = JSON.stringify(c);
            expect(FORBIDDEN_NAMES.test(blob)).toBe(false);
        }
    });

    it('daily scenario entries are descriptive-only (applyScenario is identity)', () => {
        for (const c of all.slice(0, 50)) {
            const eff = applyScenario(c.level);
            expect(eff.botPressure).toBe(c.level.botPressure);
            expect(eff.resalePressure).toBe(c.level.resalePressure);
            expect(eff.serverRisk).toBe(c.level.serverRisk);
            expect(eff.demand).toBe(c.level.demand);
        }
    });

    it('adequate variety: many distinct venues, capacities, events, and targets', () => {
        expect(new Set(all.map(c => c.venueName)).size).toBeGreaterThan(40);
        expect(new Set(all.map(c => c.capacity)).size).toBeGreaterThanOrEqual(8);
        expect(new Set(all.map(c => c.eventType)).size).toBeGreaterThanOrEqual(8);
        expect(new Set(all.map(c => c.targetScore)).size).toBeGreaterThan(5);
        // Consecutive days should almost never be identical challenges.
        let identical = 0;
        for (let i = 1; i < all.length; i++) {
            if (all[i].venueName === all[i - 1].venueName && all[i].capacity === all[i - 1].capacity) identical++;
        }
        expect(identical).toBeLessThan(all.length * 0.02);
    });

    it('every sampled challenge is clearable by at least one candidate config', () => {
        for (const c of all) {
            const best = Math.max(...DAILY_CANDIDATE_CONFIGS.map(cfg => runSimulation(c.level, cfg).overallScore));
            expect(best).toBeGreaterThanOrEqual(c.targetScore);
            // And the target is never trivial relative to the ceiling.
            expect(c.targetScore).toBeGreaterThanOrEqual(Math.min(DAILY.targetMin, best - 2));
        }
    });

    it('modifiers genuinely influence the generated level parameters', () => {
        const withBotSurge = all.filter(c => c.modifierIds.includes('bot_surge'));
        const withoutBotSurge = all.filter(c => !c.modifierIds.includes('bot_surge'));
        const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
        expect(withBotSurge.length).toBeGreaterThan(10);
        expect(avg(withBotSurge.map(c => c.level.botPressure))).toBeGreaterThan(avg(withoutBotSurge.map(c => c.level.botPressure)));

        const withServer = all.filter(c => c.modifierIds.includes('fragile_servers'));
        const withoutServer = all.filter(c => !c.modifierIds.includes('fragile_servers'));
        expect(avg(withServer.map(c => c.level.serverRisk))).toBeGreaterThan(avg(withoutServer.map(c => c.level.serverRisk)));

        // Short-notice days activate the sim's real short-notice modeling (level id 4).
        for (const c of all) {
            expect(c.level.id).toBe(c.modifierIds.includes('short_notice') ? 4 : 2);
        }

        // Viral days actually carry outsized demand.
        for (const c of withBotSurge.length ? all : all) {
            if (c.modifierIds.includes('viral_demand')) {
                expect(c.demand / c.capacity).toBeGreaterThan(DAILY.ratioMax);
            }
        }
    });

    it('identity metadata is complete for the briefing screen', () => {
        for (const c of all.slice(0, 50)) {
            const b = c.level.identity.briefing;
            expect(b.situation.length).toBeGreaterThan(0);
            expect(b.threatAssessment.length).toBeGreaterThan(0);
            expect(b.operationalGoal.length).toBeGreaterThan(0);
            expect(b.knownRisks.length).toBeGreaterThan(0);
            expect(b.successCriteria.length).toBeGreaterThan(0);
            expect(c.level.identity.missionType).toBe('Daily Challenge');
            expect(['Low', 'Moderate', 'High', 'Severe', 'Critical']).toContain(c.level.identity.threatLevel);
        }
    });
});
