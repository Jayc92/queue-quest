import { describe, it, expect } from 'vitest';
import { LEVELS } from '../data/levels';
import {
    isDebugEnabled,
    seedFreshStore, seedCampaignCleared, seedCampaignMastered, seedEndlessUnlocked,
} from './devtools';
import { deriveCampaignStatus, bestScoresFromStore } from './records';
import type { LevelId } from './types';

const PAR: Record<LevelId, number> = LEVELS.reduce((acc, l) => { acc[l.id] = l.parScore; return acc; }, {} as Record<LevelId, number>);

describe('debug flag detection', () => {
    it('is disabled by default in a non-browser (node) environment', () => {
        // vitest runs in node → no window → must safely return false, never throw.
        expect(() => isDebugEnabled()).not.toThrow();
        expect(isDebugEnabled()).toBe(false);
    });
});

describe('QA seed utilities (pure)', () => {
    it('seedFreshStore is a pristine store', () => {
        const s = seedFreshStore();
        expect(s.global.totalSimulations).toBe(0);
        expect(Object.keys(s.missions)).toHaveLength(0);
        expect(s.trainingComplete).toBeUndefined();
    });

    it('seedCampaignCleared clears all five missions and completes the campaign', () => {
        const s = seedCampaignCleared();
        const status = deriveCampaignStatus(s, PAR);
        expect(status.complete).toBe(true);
        expect(status.missionsCleared).toBe(5);
        // Every mission's best score meets its par (so unlock gating is satisfied).
        const best = bestScoresFromStore(s);
        for (const l of LEVELS) expect(best[l.id]!).toBeGreaterThanOrEqual(l.parScore);
        // Training is marked done so the onboarding prompt won't fire.
        expect(s.trainingComplete).toBe(true);
    });

    it('seedCampaignMastered masters all five missions', () => {
        const s = seedCampaignMastered();
        const status = deriveCampaignStatus(s, PAR);
        expect(status.complete).toBe(true);
        expect(status.missionsMastered).toBe(5);
        expect(s.endless?.runs ?? 0).toBeGreaterThan(0);
    });

    it('seedEndlessUnlocked satisfies the Endless unlock (campaign complete)', () => {
        const s = seedEndlessUnlocked();
        expect(deriveCampaignStatus(s, PAR).complete).toBe(true);
    });

    it('seed utilities return NEW stores (do not share mission objects)', () => {
        const a = seedCampaignCleared();
        const b = seedCampaignCleared();
        expect(a).not.toBe(b);
        expect(a.missions[1]).not.toBe(b.missions[1]);
    });
});
