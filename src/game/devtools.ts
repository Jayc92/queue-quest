// Queue Quest — developer tooling (debug flag, QA record utilities, profiling).
//
// NONE of this is reachable in normal play. The debug surface is gated behind
// `isDebugEnabled()` (query param or localStorage flag) and the profiling helpers
// no-op unless running a dev build. The QA utilities are PURE functions over a
// RecordsStore built on the same primitives the game uses, so seeding a store for
// testing produces exactly what real play would.

import type { RecordsStore, MissionRecord, LevelId } from './types';
import { LEVELS } from '../data/levels';
import {
    createEmptyStore,
    createEmptyMissionRecord,
    createEmptyEndlessRecord,
    markTrainingComplete,
} from './records';

// ============================================================
// DEBUG FLAG
// Enabled by `?debug=1` in the URL, or a `queueQuest.debug` localStorage flag.
// Setting the query param also persists the flag so it survives navigation.
// ============================================================
export const DEBUG_STORAGE_KEY = 'queueQuest.debug';

export function isDebugEnabled(): boolean {
    try {
        if (typeof window === 'undefined') return false;
        const params = new URLSearchParams(window.location.search);
        if (params.get('debug') === '1') {
            try { window.localStorage.setItem(DEBUG_STORAGE_KEY, '1'); } catch { /* ignore */ }
            return true;
        }
        if (params.get('debug') === '0') {
            try { window.localStorage.removeItem(DEBUG_STORAGE_KEY); } catch { /* ignore */ }
            return false;
        }
        return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

// ============================================================
// QA RECORD UTILITIES (pure — return a new store, never mutate)
// These are what the debug panel and tests use to jump to any progression state.
// ============================================================

const VALID_LEVEL_IDS: LevelId[] = [1, 2, 3, 4, 5];

/** A mission record at a given medal tier with sensible best-metric fills. */
function missionAt(tier: 0 | 1 | 2 | 3 | 4, score: number): MissionRecord {
    const base = createEmptyMissionRecord();
    const cleared = tier >= 2;
    return {
        ...base,
        bestScore: score,
        bestMedalTier: tier,
        bestFansServed: cleared ? 3000 : 0,
        bestFansServedPct: cleared ? 60 : 0,
        bestStability: cleared ? 70 : 0,
        bestFairness: cleared ? 80 : 0,
        bestCheckout: cleared ? 75 : 0,
        bestBotsBlocked: cleared ? 80 : 0,
        attempts: Math.max(1, tier),
        clears: cleared ? 1 : 0,
        mastered: tier === 4,
        lastPlayed: 1,
    };
}

/** Reset to a pristine, brand-new-player store. */
export function seedFreshStore(): RecordsStore {
    return createEmptyStore();
}

/** Clear all five campaign missions at CLEAR tier (unlocks Endless). Training marked done. */
export function seedCampaignCleared(): RecordsStore {
    const store = createEmptyStore();
    const missions: RecordsStore['missions'] = {};
    let highest = 0;
    for (const id of VALID_LEVEL_IDS) {
        const par = LEVELS.find(l => l.id === id)!.parScore;
        missions[id] = missionAt(2, par);
        highest = Math.max(highest, par);
    }
    return markTrainingComplete({
        ...store,
        missions,
        global: { highestScore: highest, totalSimulations: 5, totalClears: 5, totalMastered: 0, lastPlayed: 1 },
    });
}

/** Master all five campaign missions (top tier everywhere). */
export function seedCampaignMastered(): RecordsStore {
    const store = createEmptyStore();
    const missions: RecordsStore['missions'] = {};
    let highest = 0;
    for (const id of VALID_LEVEL_IDS) {
        const par = LEVELS.find(l => l.id === id)!.parScore;
        const score = par + 14; // safely inside MASTERED band
        missions[id] = { ...missionAt(4, score), bestFansServedPct: 95, bestStability: 90, bestFairness: 95, bestBotsBlocked: 95, bestCheckout: 90 };
        highest = Math.max(highest, score);
    }
    return markTrainingComplete({
        ...store,
        missions,
        global: { highestScore: highest, totalSimulations: 10, totalClears: 10, totalMastered: 5, lastPlayed: 1 },
        endless: { ...createEmptyEndlessRecord(), longestShift: 240, highestScore: 5000, highestCombo: 40, mostFansServed: 8000, runs: 3, lastPlayed: 1 },
    });
}

/** Unlock Endless specifically (== clearing the campaign). */
export function seedEndlessUnlocked(): RecordsStore {
    return seedCampaignCleared();
}

// ============================================================
// PROFILING (development only — zero production overhead)
// `import.meta.env.DEV` is statically replaced at build time, so these calls are
// dead-code-eliminated from production bundles.
// ============================================================

/** Time a synchronous function and log it — only in dev. Returns the fn's result. */
export function profile<T>(label: string, fn: () => T): T {
    if (!import.meta.env.DEV) return fn();
    const start = performance.now();
    try {
        return fn();
    } finally {
        // eslint-disable-next-line no-console
        console.debug(`[qq-profile] ${label}: ${(performance.now() - start).toFixed(2)}ms`);
    }
}

/** Mark a point in time for coarse timeline profiling — only in dev. */
export function profileMark(label: string): void {
    if (!import.meta.env.DEV) return;
    try { performance.mark(`qq:${label}`); } catch { /* ignore */ }
}
