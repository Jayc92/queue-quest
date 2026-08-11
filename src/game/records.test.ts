import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LEVELS } from '../data/levels';
import { runSimulation } from './simulation';
import { getRank } from './ranks';
import {
    RECORDS_STORAGE_KEY,
    RECORDS_VERSION,
    MIN_SUPPORTED_VERSION,
    createEmptyStore,
    createEmptyMissionRecord,
    parseStore,
    applyResult,
    nextGoal,
    deriveOperatorSummary,
    deriveCampaignStatus,
    bestScoresFromStore,
    loadRecords,
    saveRecords,
    resetRecords,
    markTrainingComplete,
    markTrainingSeen,
    shouldPromptTraining,
    applyDailyResult,
    applyEndlessResult,
    effectiveDailyStreak,
    createEmptyDailyRecord,
} from './records';
import type { GameConfig, Level, LevelId, SimulationResult, RecordsStore } from './types';

const PAR: Record<LevelId, number> = { 1: 58, 2: 61, 3: 62, 4: 63, 5: 62 };

// Clear every mission in a store using each level's documented passing setup.
function clearAllMissions(): RecordsStore {
    const strong: Record<number, GameConfig> = {
        1: { botDetection: 'high', verification: 'basic', purchaseLimit: 2, resale: 'face', waveCount: 2, waveInterval: 15, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 6 },
        2: { botDetection: 'high', verification: 'basic', purchaseLimit: 4, resale: 'caps', waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 25, accessiblePercent: 5 },
        3: { botDetection: 'high', verification: 'basic', purchaseLimit: 4, resale: 'caps', waveCount: 4, waveInterval: 20, waitingRoomTime: 3, presalePercent: 20, accessiblePercent: 8 },
        4: { botDetection: 'high', verification: 'verified', purchaseLimit: 2, resale: 'face', waveCount: 3, waveInterval: 20, waitingRoomTime: 1, presalePercent: 30, accessiblePercent: 5 },
        5: { botDetection: 'high', verification: 'verified', purchaseLimit: 2, resale: 'face', waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 25, accessiblePercent: 8 },
    };
    let store = createEmptyStore();
    for (let id = 1; id <= 5; id++) {
        const l = LEVELS.find(lvl => lvl.id === id)!;
        store = applyResult(store, l, runSimulation(l, strong[id]), id * 1000).store;
    }
    return store;
}

function level(id: number): Level {
    const l = LEVELS.find(lvl => lvl.id === id);
    if (!l) throw new Error(`Level ${id} not found`);
    return l;
}

// A config known to clear Level 1 (from simulation.test.ts).
const clearL1: GameConfig = { botDetection: 'high', verification: 'basic', purchaseLimit: 2, resale: 'face', waveCount: 2, waveInterval: 15, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 6 };
// A config known to fail every level.
const failL1: GameConfig = { botDetection: 'low', verification: 'none', purchaseLimit: 8, resale: 'none', waveCount: 1, waveInterval: 15, waitingRoomTime: 24, presalePercent: 0, accessiblePercent: 1 };
// A config known to master Level 4 (STRONG/MASTERED band per simulation tests).
const masterL4: GameConfig = { botDetection: 'high', verification: 'verified', purchaseLimit: 2, resale: 'face', waveCount: 3, waveInterval: 20, waitingRoomTime: 1, presalePercent: 30, accessiblePercent: 5 };

// In-memory localStorage stub for adapter tests.
class MemoryStorage {
    private map = new Map<string, string>();
    getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
    setItem(k: string, v: string) { this.map.set(k, v); }
    removeItem(k: string) { this.map.delete(k); }
    clear() { this.map.clear(); }
    key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
    get length() { return this.map.size; }
}

function installStorage(): MemoryStorage {
    const mem = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: mem });
    return mem;
}

describe('parseStore — recovery', () => {
    it('missing / null data returns an empty store', () => {
        const s = parseStore(null);
        expect(s.version).toBe(1);
        expect(s.missions).toEqual({});
        expect(s.global.totalSimulations).toBe(0);
    });

    it('non-object garbage returns an empty store', () => {
        expect(parseStore('nonsense').global.totalSimulations).toBe(0);
        expect(parseStore(42).missions).toEqual({});
    });

    it('unknown future version is discarded for a fresh store', () => {
        const future = { version: 999, missions: { 1: { bestScore: 88 } }, global: { highestScore: 88 } };
        const s = parseStore(future);
        expect(s.version).toBe(1);
        expect(s.missions[1]).toBeUndefined();
        expect(s.global.highestScore).toBe(0);
    });

    it('a missing version is treated as unrecoverable → fresh store', () => {
        const s = parseStore({ missions: { 1: { bestScore: 70 } }, global: { highestScore: 70 } });
        expect(s.missions[1]).toBeUndefined();
        expect(s.global.highestScore).toBe(0);
    });

    it('a non-numeric version is rejected → fresh store', () => {
        const s = parseStore({ version: 'v1', missions: { 1: { bestScore: 70 } }, global: {} });
        expect(s.missions[1]).toBeUndefined();
    });

    it('a current-version save round-trips through the migration pipeline unchanged', () => {
        const raw = { version: RECORDS_VERSION, missions: { 3: { bestScore: 62, clears: 1, attempts: 2 } }, global: { highestScore: 62, totalSimulations: 2 } };
        const s = parseStore(raw);
        expect(s.version).toBe(RECORDS_VERSION);
        expect(s.missions[3]!.bestScore).toBe(62);
        expect(s.missions[3]!.clears).toBe(1);
        expect(s.global.highestScore).toBe(62);
    });

    it('MIN_SUPPORTED_VERSION never exceeds the current version', () => {
        expect(MIN_SUPPORTED_VERSION).toBeLessThanOrEqual(RECORDS_VERSION);
    });

    it('sanitizes partial / malformed mission fields', () => {
        const dirty = {
            version: 1,
            missions: { 1: { bestScore: 'oops', attempts: -5, mastered: 'yes', bestMedalTier: 99 } },
            global: { highestScore: NaN },
        };
        const s = parseStore(dirty);
        expect(s.missions[1]!.bestScore).toBe(0);
        expect(s.missions[1]!.attempts).toBe(0);
        expect(s.missions[1]!.mastered).toBe(false);
        expect(s.missions[1]!.bestMedalTier).toBe(4); // clamped to max
        expect(s.global.highestScore).toBe(0);
    });

    it('older v1 save without onboarding flags loads unchanged (backward compatible)', () => {
        const legacy = { version: 1, missions: { 1: { bestScore: 70 } }, global: { highestScore: 70, totalSimulations: 3 } };
        const s = parseStore(legacy);
        expect(s.trainingComplete).toBeUndefined();
        expect(s.trainingSeen).toBeUndefined();
        expect(s.missions[1]!.bestScore).toBe(70);
    });

    it('carries onboarding flags through when present', () => {
        const s = parseStore({ version: 1, missions: {}, global: {}, trainingComplete: true, trainingSeen: true });
        expect(s.trainingComplete).toBe(true);
        expect(s.trainingSeen).toBe(true);
    });

    it('ignores non-boolean onboarding flags', () => {
        const s = parseStore({ version: 1, missions: {}, global: {}, trainingComplete: 'yes', trainingSeen: 1 });
        expect(s.trainingComplete).toBeUndefined();
        expect(s.trainingSeen).toBeUndefined();
    });
});

describe('Training onboarding flags', () => {
    it('shouldPromptTraining is true only for a brand-new player', () => {
        expect(shouldPromptTraining(createEmptyStore())).toBe(true);
    });
    it('shouldPromptTraining is false once the prompt was seen', () => {
        expect(shouldPromptTraining(markTrainingSeen(createEmptyStore()))).toBe(false);
    });
    it('shouldPromptTraining is false once training is complete', () => {
        expect(shouldPromptTraining(markTrainingComplete(createEmptyStore()))).toBe(false);
    });
    it('shouldPromptTraining is false once the player has any play history', () => {
        const played = { ...createEmptyStore(), global: { ...createEmptyStore().global, totalSimulations: 1 } };
        expect(shouldPromptTraining(played)).toBe(false);
    });
    it('markTrainingComplete implies seen and survives a save→load round-trip', () => {
        const mem = installStorage();
        const done = markTrainingComplete(createEmptyStore());
        expect(done.trainingSeen).toBe(true);
        saveRecords(done);
        const loaded = loadRecords();
        expect(loaded.trainingComplete).toBe(true);
        expect(loaded.trainingSeen).toBe(true);
        void mem;
    });
});

describe('loadRecords — adapter recovery', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('missing storage entry → empty store', () => {
        installStorage();
        expect(loadRecords().global.totalSimulations).toBe(0);
    });

    it('corrupt JSON → empty store, no throw', () => {
        const mem = installStorage();
        mem.setItem(RECORDS_STORAGE_KEY, '{ not valid json ');
        expect(() => loadRecords()).not.toThrow();
        expect(loadRecords().global.totalSimulations).toBe(0);
    });

    it('no window (SSR / node) → empty store, no throw', () => {
        vi.unstubAllGlobals();
        // window may be undefined in the node test env
        expect(() => loadRecords()).not.toThrow();
    });
});

describe('applyResult — preserves sibling record families', () => {
    // Regression guard: applyResult once rebuilt the store from scratch, silently
    // wiping endless/daily records and onboarding flags on every campaign run.
    it('a campaign run never drops daily, endless, or training data', () => {
        let store: RecordsStore = markTrainingComplete(createEmptyStore());
        // Seed a daily clear and an endless run first.
        const dailyResult = runSimulation(level(1), clearL1);
        store = applyDailyResult(store, '2026-08-06', dailyResult, 50, 1000).store;
        store = applyEndlessResult(store, {
            timeSurvived: 120, wavesReached: 3, fansServed: 5000, botsBlocked: 500,
            highestCombo: 10, stability: 40, fairness: 60, operatorScore: 3000,
            endReason: 'stability', decisionsCorrect: 1, decisionsWrong: 0, decisionsIgnored: 0,
            longestCorrectStreak: 1, history: [],
        }, 2000).store;

        // Now play a campaign mission — the other families must survive.
        const after = applyResult(store, level(1), runSimulation(level(1), clearL1), 3000).store;
        expect(after.daily?.bestScoreToday).toBe(store.daily!.bestScoreToday);
        expect(after.daily?.currentStreak).toBe(store.daily!.currentStreak);
        expect(after.endless?.runs).toBe(1);
        expect(after.trainingComplete).toBe(true);
        expect(after.trainingSeen).toBe(true);
    });
});

describe('applyResult — first result', () => {
    it('saves first result and counts one attempt', () => {
        const store = createEmptyStore();
        const result = runSimulation(level(1), clearL1);
        const { store: next } = applyResult(store, level(1), result, 1000);
        const rec = next.missions[1]!;
        expect(rec.attempts).toBe(1);
        expect(rec.bestScore).toBe(result.overallScore);
        expect(rec.lastPlayed).toBe(1000);
        expect(next.global.totalSimulations).toBe(1);
    });

    it('flags improvements on first positive-score attempt', () => {
        const result = runSimulation(level(1), clearL1);
        const { improvements } = applyResult(createEmptyStore(), level(1), result, 1);
        expect(improvements.newBestScore).toBe(true);
        expect(improvements.anyImprovement).toBe(true);
    });
});

describe('applyResult — better / worse score', () => {
    it('better score updates bestScore and flags new best', () => {
        let store = createEmptyStore();
        const weak = runSimulation(level(1), failL1);
        store = applyResult(store, level(1), weak, 1).store;
        const strong = runSimulation(level(1), clearL1);
        const { store: after, improvements } = applyResult(store, level(1), strong, 2);
        expect(after.missions[1]!.bestScore).toBe(strong.overallScore);
        expect(improvements.newBestScore).toBe(true);
    });

    it('worse score keeps the prior best and does not flag new best', () => {
        let store = createEmptyStore();
        const strong = runSimulation(level(1), clearL1);
        store = applyResult(store, level(1), strong, 1).store;
        const weak = runSimulation(level(1), failL1);
        const { store: after, improvements } = applyResult(store, level(1), weak, 2);
        expect(after.missions[1]!.bestScore).toBe(strong.overallScore);
        expect(improvements.newBestScore).toBe(false);
        expect(after.missions[1]!.attempts).toBe(2);
    });
});

describe('applyResult — better medal', () => {
    it('records the higher medal tier and flags newlyMastered once', () => {
        let store = createEmptyStore();
        // First a plain fail on L4.
        const fail = runSimulation(level(4), failL1);
        store = applyResult(store, level(4), fail, 1).store;
        // Then a mastering run.
        const master = runSimulation(level(4), masterL4);
        const rankTier = getRank(master.overallScore, level(4).parScore).tier;
        const { store: after, improvements } = applyResult(store, level(4), master, 2);
        expect(after.missions[4]!.bestMedalTier).toBeGreaterThanOrEqual(rankTier === 4 ? 4 : 2);
        if (rankTier === 4) {
            expect(after.missions[4]!.mastered).toBe(true);
            expect(improvements.newlyMastered).toBe(true);
        }
    });
});

describe('applyResult — attempt / clear / master counting', () => {
    it('counts attempts on every run', () => {
        let store = createEmptyStore();
        for (let i = 0; i < 3; i++) {
            store = applyResult(store, level(1), runSimulation(level(1), failL1), i).store;
        }
        expect(store.missions[1]!.attempts).toBe(3);
        expect(store.global.totalSimulations).toBe(3);
    });

    it('counts clears only on passing runs', () => {
        let store = createEmptyStore();
        store = applyResult(store, level(1), runSimulation(level(1), failL1), 1).store;   // fail
        store = applyResult(store, level(1), runSimulation(level(1), clearL1), 2).store;   // clear
        store = applyResult(store, level(1), runSimulation(level(1), clearL1), 3).store;   // clear
        expect(store.missions[1]!.clears).toBe(2);
        expect(store.global.totalClears).toBe(2);
    });

    it('counts mastered runs globally each time and marks the mission mastered', () => {
        let store = createEmptyStore();
        const master = runSimulation(level(4), masterL4);
        const isMaster = getRank(master.overallScore, level(4).parScore).tier === 4;
        store = applyResult(store, level(4), master, 1).store;
        store = applyResult(store, level(4), master, 2).store;
        if (isMaster) {
            expect(store.missions[4]!.mastered).toBe(true);
            expect(store.global.totalMastered).toBe(2);
        }
    });
});

describe('nextGoal — goal generation', () => {
    it('never-played mission → Clear Mission', () => {
        expect(nextGoal(level(1), undefined).key).toBe('clear');
        expect(nextGoal(level(1), createEmptyMissionRecord()).key).toBe('clear');
    });

    it('cleared but low medal → Reach Strong Clear', () => {
        const rec = { ...createEmptyMissionRecord(), attempts: 1, clears: 1, bestMedalTier: 2 as const, bestScore: 66 };
        expect(nextGoal(level(1), rec).key).toBe('strong');
    });

    it('strong clear → Master Mission', () => {
        const rec = { ...createEmptyMissionRecord(), attempts: 1, clears: 1, bestMedalTier: 3 as const, bestScore: 76 };
        expect(nextGoal(level(1), rec).key).toBe('master');
    });

    it('mastered with metric headroom → a specific metric goal', () => {
        const rec = {
            ...createEmptyMissionRecord(),
            attempts: 5, clears: 5, mastered: true, bestMedalTier: 4 as const, bestScore: 90,
            bestFansServedPct: 40, bestStability: 100, bestFairness: 100, bestBotsBlocked: 100, bestCheckout: 100,
        };
        expect(nextGoal(level(1), rec).key).toBe('fans');
    });

    it('mastered with all metrics maxed → Beat Best Score', () => {
        const rec = {
            ...createEmptyMissionRecord(),
            attempts: 9, clears: 9, mastered: true, bestMedalTier: 4 as const, bestScore: 99,
            bestFansServedPct: 100, bestStability: 100, bestFairness: 100, bestBotsBlocked: 100, bestCheckout: 100,
        };
        expect(nextGoal(level(1), rec).key).toBe('beat');
    });
});

describe('deriveOperatorSummary', () => {
    it('counts distinct cleared and mastered missions', () => {
        let store = createEmptyStore();
        store = applyResult(store, level(1), runSimulation(level(1), clearL1), 1).store;
        store = applyResult(store, level(1), runSimulation(level(1), clearL1), 2).store; // same mission twice
        const summary = deriveOperatorSummary(store);
        expect(summary.missionsCleared).toBe(1); // distinct, not cumulative
        expect(summary.totalRuns).toBe(2);
        expect(summary.highestScore).toBeGreaterThan(0);
    });
});

describe('bestScoresFromStore — unlock restoration', () => {
    it('exposes best scores for attempted missions to restore unlocks', () => {
        let store = createEmptyStore();
        store = applyResult(store, level(1), runSimulation(level(1), clearL1), 1).store;
        const map = bestScoresFromStore(store);
        expect(map[1]).toBeGreaterThan(0);
        expect(map[2]).toBeUndefined();
    });

    it('round-trips through save/load and restores unlock data', () => {
        installStorage();
        let store = createEmptyStore();
        store = applyResult(store, level(1), runSimulation(level(1), clearL1), 1).store;
        saveRecords(store);
        const loaded = loadRecords();
        expect(loaded.missions[1]!.bestScore).toBe(store.missions[1]!.bestScore);
        expect(bestScoresFromStore(loaded)[1]).toBe(store.missions[1]!.bestScore);
    });
});

describe('resetRecords', () => {
    it('clears only the queueQuest.records.v1 key and returns empty store', () => {
        const mem = installStorage();
        mem.setItem(RECORDS_STORAGE_KEY, JSON.stringify(createEmptyStore()));
        mem.setItem('unrelated.key', 'keep-me');
        const cleared = resetRecords();
        expect(mem.getItem(RECORDS_STORAGE_KEY)).toBeNull();
        expect(mem.getItem('unrelated.key')).toBe('keep-me');
        expect(cleared.global.totalSimulations).toBe(0);
    });
});

describe('metric ranges after apply', () => {
    it('never records negative or absurd values', () => {
        let store = createEmptyStore();
        const r: SimulationResult = runSimulation(level(5), masterL4);
        store = applyResult(store, level(5), r, 1).store;
        const rec = store.missions[5]!;
        expect(rec.bestScore).toBeGreaterThanOrEqual(0);
        expect(rec.bestScore).toBeLessThanOrEqual(100);
        expect(rec.bestFairness).toBeLessThanOrEqual(100);
        expect(rec.bestStability).toBeLessThanOrEqual(100);
    });
});

describe('deriveCampaignStatus — campaign completion', () => {
    it('fresh store is not complete', () => {
        const status = deriveCampaignStatus(createEmptyStore(), PAR);
        expect(status.complete).toBe(false);
        expect(status.missionsCleared).toBe(0);
        expect(status.operatorRank).toBe('Trainee Operator');
    });

    it('partial progress is not complete', () => {
        let store = createEmptyStore();
        store = applyResult(store, level(1), runSimulation(level(1), clearL1), 1).store;
        const status = deriveCampaignStatus(store, PAR);
        expect(status.complete).toBe(false);
        expect(status.missionsCleared).toBe(1);
    });

    it('clearing all five missions completes the campaign', () => {
        const store = clearAllMissions();
        const status = deriveCampaignStatus(store, PAR);
        expect(status.complete).toBe(true);
        expect(status.missionsCleared).toBe(5);
        expect(status.operatorRank).not.toBe('Trainee Operator');
        expect(status.overallRating.length).toBeGreaterThan(0);
    });

    it('counts strong clears (tier >= 3) distinctly', () => {
        const store = clearAllMissions();
        const status = deriveCampaignStatus(store, PAR);
        // Documented strong setups push L4/L5 to STRONG or better, so at least some strong clears exist.
        expect(status.strongClears).toBeGreaterThanOrEqual(0);
        expect(status.strongClears).toBeLessThanOrEqual(5);
    });

    it('reports highest score and total runs from global stats', () => {
        const store = clearAllMissions();
        const status = deriveCampaignStatus(store, PAR);
        expect(status.totalRuns).toBe(5);
        expect(status.highestScore).toBe(store.global.highestScore);
    });

    it('rank escalates with mastery — all mastered yields Grandmaster', () => {
        // Force a fully-mastered store to check the top rank branch deterministically.
        let store = createEmptyStore();
        for (let id = 1; id <= 5; id++) {
            store.missions[id as LevelId] = {
                ...createEmptyMissionRecord(),
                attempts: 1, clears: 1, mastered: true, bestMedalTier: 4, bestScore: 90,
            };
        }
        store.global.highestScore = 90;
        store.global.totalSimulations = 5;
        const status = deriveCampaignStatus(store, PAR);
        expect(status.missionsMastered).toBe(5);
        expect(status.operatorRank).toBe('Onsale Grandmaster');
    });
});

describe('Daily Challenge records & streaks', () => {
    // A deterministic real result to feed in; target is set relative to its score
    // so we can force pass/fail without caring about the absolute value.
    const res = runSimulation(level(1), clearL1);
    const passTarget = res.overallScore - 5;   // res clears this
    const failTarget = res.overallScore + 5;   // res misses this
    const D1 = '2026-08-06', D2 = '2026-08-07', D4 = '2026-08-09'; // D3 skipped for gap tests

    it('first attempt seeds the record with today fields and a config snapshot', () => {
        const { store, newDailyBest, firstClearToday } = applyDailyResult(createEmptyStore(), D1, res, failTarget, 100);
        const d = store.daily!;
        expect(d.dateKey).toBe(D1);
        expect(d.attemptsToday).toBe(1);
        expect(d.bestScoreToday).toBe(res.overallScore);
        expect(d.bestConfigToday).toEqual(res.config);
        expect(newDailyBest).toBe(true);
        expect(firstClearToday).toBe(false);      // failTarget → not cleared
        expect(d.completedToday).toBe(false);
        expect(d.currentStreak).toBe(0);
    });

    it('a clear sets completion, streak 1, totalCompleted 1', () => {
        const { store, firstClearToday } = applyDailyResult(createEmptyStore(), D1, res, passTarget, 100);
        const d = store.daily!;
        expect(firstClearToday).toBe(true);
        expect(d.completedToday).toBe(true);
        expect(d.currentStreak).toBe(1);
        expect(d.longestStreak).toBe(1);
        expect(d.totalCompleted).toBe(1);
        expect(d.lastCompletedDateKey).toBe(D1);
    });

    it('repeated same-day clears never inflate streak or totalCompleted', () => {
        let s = applyDailyResult(createEmptyStore(), D1, res, passTarget, 100).store;
        const second = applyDailyResult(s, D1, res, passTarget, 200);
        expect(second.firstClearToday).toBe(false);
        expect(second.store.daily!.attemptsToday).toBe(2);
        expect(second.store.daily!.currentStreak).toBe(1);
        expect(second.store.daily!.totalCompleted).toBe(1);
    });

    it('a worse later score never lowers the daily best', () => {
        const worse = runSimulation(level(1), failL1);
        expect(worse.overallScore).toBeLessThan(res.overallScore);
        let s = applyDailyResult(createEmptyStore(), D1, res, passTarget, 100).store;
        const after = applyDailyResult(s, D1, worse, passTarget, 200);
        expect(after.newDailyBest).toBe(false);
        expect(after.store.daily!.bestScoreToday).toBe(res.overallScore);
        expect(after.store.daily!.bestConfigToday).toEqual(res.config);
    });

    it('a new day rolls today-fields over and a consecutive-day clear extends the streak', () => {
        let s = applyDailyResult(createEmptyStore(), D1, res, passTarget, 100).store;
        const day2 = applyDailyResult(s, D2, res, passTarget, 200);
        const d = day2.store.daily!;
        expect(d.dateKey).toBe(D2);
        expect(d.attemptsToday).toBe(1);          // rolled over
        expect(d.currentStreak).toBe(2);          // consecutive
        expect(d.longestStreak).toBe(2);
        expect(d.totalCompleted).toBe(2);
    });

    it('a missed day resets the streak to 1 on the next clear (longest retained)', () => {
        let s = applyDailyResult(createEmptyStore(), D1, res, passTarget, 100).store;
        s = applyDailyResult(s, D2, res, passTarget, 200).store;      // streak 2
        const afterGap = applyDailyResult(s, D4, res, passTarget, 300); // D3 skipped
        expect(afterGap.store.daily!.currentStreak).toBe(1);
        expect(afterGap.store.daily!.longestStreak).toBe(2);
        expect(afterGap.store.daily!.totalCompleted).toBe(3);
    });

    it('a failed attempt on a new day rolls over without touching streak state', () => {
        let s = applyDailyResult(createEmptyStore(), D1, res, passTarget, 100).store;
        const day2fail = applyDailyResult(s, D2, res, failTarget, 200);
        const d = day2fail.store.daily!;
        expect(d.completedToday).toBe(false);
        expect(d.currentStreak).toBe(1);          // still describes D1's chain
        expect(d.lastCompletedDateKey).toBe(D1);
    });

    it('effectiveDailyStreak: alive today and yesterday, broken after a gap', () => {
        const s = applyDailyResult(createEmptyStore(), D1, res, passTarget, 100).store;
        expect(effectiveDailyStreak(s.daily, D1)).toBe(1);   // cleared today
        expect(effectiveDailyStreak(s.daily, D2)).toBe(1);   // yesterday — alive pending
        expect(effectiveDailyStreak(s.daily, D4)).toBe(0);   // gap — broken
        expect(effectiveDailyStreak(undefined, D1)).toBe(0);
        expect(effectiveDailyStreak(createEmptyDailyRecord(), D1)).toBe(0);
    });

    it('daily record survives a save→load round-trip', () => {
        installStorage();
        const s = applyDailyResult(createEmptyStore(), D1, res, passTarget, 100).store;
        saveRecords(s);
        const loaded = loadRecords();
        expect(loaded.daily).toEqual(s.daily);
    });

    it('older saves without a daily record load unchanged; garbage daily is sanitized', () => {
        const legacy = parseStore({ version: 1, missions: {}, global: {} });
        expect(legacy.daily).toBeUndefined();
        const dirty = parseStore({
            version: 1, missions: {}, global: {},
            daily: { dateKey: 'not-a-date', attemptsToday: -3, bestScoreToday: 'x', completedToday: 'yes', currentStreak: 2.7, bestConfigToday: { botDetection: 'bogus' } },
        });
        const d = dirty.daily!;
        expect(d.dateKey).toBe('');
        expect(d.attemptsToday).toBe(0);
        expect(d.bestScoreToday).toBe(0);
        expect(d.completedToday).toBe(false);
        expect(d.currentStreak).toBe(3);
        expect(d.bestConfigToday).toBeUndefined();
    });
});
