// Queue Quest — Local Records & Mastery.
//
// Pure record logic + a thin localStorage adapter. The pure functions
// (createEmptyStore, applyResult, computeImprovements, nextGoal, deriveOperatorSummary,
// parseStore) never touch the DOM and are fully unit-testable. The adapter functions
// (loadRecords, saveRecords, resetRecords) wrap localStorage and never throw.

import type {
    LevelId,
    Level,
    MissionRecord,
    RecordsStore,
    GlobalStats,
    RecordImprovements,
    MissionGoal,
    OperatorSummary,
    CampaignStatus,
    SimulationResult,
    EndlessRecord,
    EndlessRunResult,
    EndlessImprovements,
    DailyRecord,
    GameConfig,
} from './types';
import { getRank } from './ranks';
import { isNextCalendarDay } from './dateUtils';

export const RECORDS_STORAGE_KEY = 'queueQuest.records.v1';
export const RECORDS_VERSION = 1 as const;

// The lowest stored `version` this build knows how to upgrade from. Anything
// below this (or above RECORDS_VERSION, or missing) can't be safely interpreted
// and resets to a fresh store. Bump this only if you ever DROP support for an
// ancient schema.
export const MIN_SUPPORTED_VERSION = 1;

const VALID_LEVEL_IDS: LevelId[] = [1, 2, 3, 4, 5];

// ---------- Migration pipeline ----------
// Each entry upgrades a raw stored object from version N to N+1. Keep them PURE
// (raw object → raw object), additive, and defensive — the sanitizers below still
// run afterward, so a migration only needs to reshape/rename fields, not validate.
//
// To add v2 later:
//   1. Change RECORDS_VERSION to 2 and the RecordsStore.version type.
//   2. Add `1: (raw) => ({ ...raw, version: 2, /* new fields with defaults */ })`.
//   3. Add a test asserting a v1 blob upgrades cleanly (see records.test.ts).
type RawObject = Record<string, unknown>;
const MIGRATIONS: Record<number, (raw: RawObject) => RawObject> = {
    // (no migrations yet — v1 is the only schema)
};

// Run migrations sequentially from the stored version up to RECORDS_VERSION.
// Returns the upgraded raw object, or null if the version can't be handled.
function runMigrations(raw: RawObject): RawObject | null {
    const version = typeof raw.version === 'number' ? raw.version : NaN;
    if (!Number.isFinite(version)) return null;
    if (version > RECORDS_VERSION) return null;            // future save — don't guess
    if (version < MIN_SUPPORTED_VERSION) return null;      // too old to upgrade
    let current = raw;
    for (let v = version; v < RECORDS_VERSION; v++) {
        const step = MIGRATIONS[v];
        if (!step) return null;                            // gap in the chain — bail safely
        current = step(current);
    }
    return current;
}

function createEmptyGlobal(): GlobalStats {
    return {
        highestScore: 0,
        totalSimulations: 0,
        totalClears: 0,
        totalMastered: 0,
        lastPlayed: 0,
    };
}

export function createEmptyMissionRecord(): MissionRecord {
    return {
        bestScore: 0,
        bestMedalTier: 0,
        bestFansServed: 0,
        bestFansServedPct: 0,
        bestStability: 0,
        bestFairness: 0,
        bestCheckout: 0,
        bestBotsBlocked: 0,
        attempts: 0,
        clears: 0,
        mastered: false,
        lastPlayed: 0,
    };
}

export function createEmptyEndlessRecord(): EndlessRecord {
    return {
        longestShift: 0,
        highestScore: 0,
        highestCombo: 0,
        mostFansServed: 0,
        bestStability: 0,
        bestFairness: 0,
        runs: 0,
        lastPlayed: 0,
        totalDecisionsCorrect: 0,
        totalDecisionsWrong: 0,
        totalDecisionsIgnored: 0,
        bestCorrectStreak: 0,
    };
}

export function createEmptyDailyRecord(): DailyRecord {
    return {
        dateKey: '',
        attemptsToday: 0,
        bestScoreToday: 0,
        bestMedalTierToday: 0,
        completedToday: false,
        currentStreak: 0,
        longestStreak: 0,
        totalCompleted: 0,
        lastCompletedDateKey: '',
        lastPlayed: 0,
    };
}

export function createEmptyStore(): RecordsStore {
    return {
        version: RECORDS_VERSION,
        missions: {},
        global: createEmptyGlobal(),
    };
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function sanitizeMissionRecord(raw: unknown): MissionRecord {
    const base = createEmptyMissionRecord();
    if (!raw || typeof raw !== 'object') return base;
    const r = raw as Record<string, unknown>;
    const num = (v: unknown, fallback: number) => (isFiniteNumber(v) ? v : fallback);
    const tier = num(r.bestMedalTier, 0);
    return {
        bestScore: Math.max(0, num(r.bestScore, 0)),
        bestMedalTier: (Math.min(4, Math.max(0, Math.round(tier))) as MissionRecord['bestMedalTier']),
        bestFansServed: Math.max(0, num(r.bestFansServed, 0)),
        bestFansServedPct: Math.max(0, num(r.bestFansServedPct, 0)),
        bestStability: Math.max(0, num(r.bestStability, 0)),
        bestFairness: Math.max(0, num(r.bestFairness, 0)),
        bestCheckout: Math.max(0, num(r.bestCheckout, 0)),
        bestBotsBlocked: Math.max(0, num(r.bestBotsBlocked, 0)),
        attempts: Math.max(0, Math.round(num(r.attempts, 0))),
        clears: Math.max(0, Math.round(num(r.clears, 0))),
        mastered: r.mastered === true,
        lastPlayed: Math.max(0, num(r.lastPlayed, 0)),
    };
}

function sanitizeGlobal(raw: unknown): GlobalStats {
    const base = createEmptyGlobal();
    if (!raw || typeof raw !== 'object') return base;
    const g = raw as Record<string, unknown>;
    const num = (v: unknown, fallback: number) => (isFiniteNumber(v) ? v : fallback);
    return {
        highestScore: Math.max(0, num(g.highestScore, 0)),
        totalSimulations: Math.max(0, Math.round(num(g.totalSimulations, 0))),
        totalClears: Math.max(0, Math.round(num(g.totalClears, 0))),
        totalMastered: Math.max(0, Math.round(num(g.totalMastered, 0))),
        lastPlayed: Math.max(0, num(g.lastPlayed, 0)),
    };
}

function sanitizeEndless(raw: unknown): EndlessRecord | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const e = raw as Record<string, unknown>;
    const num = (v: unknown, fallback: number) => (isFiniteNumber(v) ? v : fallback);
    return {
        longestShift: Math.max(0, num(e.longestShift, 0)),
        highestScore: Math.max(0, num(e.highestScore, 0)),
        highestCombo: Math.max(0, num(e.highestCombo, 0)),
        mostFansServed: Math.max(0, num(e.mostFansServed, 0)),
        bestStability: Math.max(0, num(e.bestStability, 0)),
        bestFairness: Math.max(0, num(e.bestFairness, 0)),
        runs: Math.max(0, Math.round(num(e.runs, 0))),
        lastPlayed: Math.max(0, num(e.lastPlayed, 0)),
        totalDecisionsCorrect: Math.max(0, Math.round(num(e.totalDecisionsCorrect, 0))),
        totalDecisionsWrong: Math.max(0, Math.round(num(e.totalDecisionsWrong, 0))),
        totalDecisionsIgnored: Math.max(0, Math.round(num(e.totalDecisionsIgnored, 0))),
        bestCorrectStreak: Math.max(0, Math.round(num(e.bestCorrectStreak, 0))),
    };
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_BOT: readonly string[] = ['low', 'medium', 'high', 'aggressive'];
const VALID_VERIFY: readonly string[] = ['none', 'basic', 'verified'];
const VALID_RESALE: readonly string[] = ['none', 'caps', 'face', 'no_resale'];

// Loose validation of a persisted best-config snapshot. Malformed → dropped
// (the snapshot is a convenience, never load-bearing).
function sanitizeDailyConfig(raw: unknown): GameConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const c = raw as Record<string, unknown>;
    if (!VALID_BOT.includes(c.botDetection as string)) return undefined;
    if (!VALID_VERIFY.includes(c.verification as string)) return undefined;
    if (!VALID_RESALE.includes(c.resale as string)) return undefined;
    const nums = ['waitingRoomTime', 'purchaseLimit', 'waveCount', 'waveInterval', 'accessiblePercent', 'presalePercent'];
    if (!nums.every(k => isFiniteNumber(c[k]))) return undefined;
    return raw as GameConfig;
}

function sanitizeDaily(raw: unknown): DailyRecord | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const d = raw as Record<string, unknown>;
    const num = (v: unknown, fallback: number) => (isFiniteNumber(v) ? v : fallback);
    const tier = Math.min(4, Math.max(0, Math.round(num(d.bestMedalTierToday, 0)))) as DailyRecord['bestMedalTierToday'];
    const key = (v: unknown) => (typeof v === 'string' && (v === '' || DATE_KEY_RE.test(v)) ? v : '');
    const rec: DailyRecord = {
        dateKey: key(d.dateKey),
        attemptsToday: Math.max(0, Math.round(num(d.attemptsToday, 0))),
        bestScoreToday: Math.max(0, num(d.bestScoreToday, 0)),
        bestMedalTierToday: tier,
        completedToday: d.completedToday === true,
        currentStreak: Math.max(0, Math.round(num(d.currentStreak, 0))),
        longestStreak: Math.max(0, Math.round(num(d.longestStreak, 0))),
        totalCompleted: Math.max(0, Math.round(num(d.totalCompleted, 0))),
        lastCompletedDateKey: key(d.lastCompletedDateKey),
        lastPlayed: Math.max(0, num(d.lastPlayed, 0)),
    };
    const cfg = sanitizeDailyConfig(d.bestConfigToday);
    if (cfg) rec.bestConfigToday = cfg;
    return rec;
}

// Parse any stored/candidate value into a valid RecordsStore. Never throws.
// Pipeline: reject non-objects → migrate older-but-known versions up to current
// → sanitize every field with safe defaults. Future/too-old/broken → fresh store.
export function parseStore(raw: unknown): RecordsStore {
    if (!raw || typeof raw !== 'object') return createEmptyStore();

    // Upgrade older known schemas to the current version; bail to a fresh store
    // for future/unsupported versions rather than guessing at their shape.
    const migrated = runMigrations(raw as Record<string, unknown>);
    if (!migrated || migrated.version !== RECORDS_VERSION) return createEmptyStore();
    const obj = migrated;

    const store = createEmptyStore();
    store.global = sanitizeGlobal(obj.global);

    const missionsRaw = obj.missions;
    if (missionsRaw && typeof missionsRaw === 'object') {
        for (const id of VALID_LEVEL_IDS) {
            const rec = (missionsRaw as Record<string, unknown>)[String(id)];
            if (rec !== undefined) {
                store.missions[id] = sanitizeMissionRecord(rec);
            }
        }
    }

    const endless = sanitizeEndless(obj.endless);
    if (endless) store.endless = endless;

    const daily = sanitizeDaily(obj.daily);
    if (daily) store.daily = daily;

    // Onboarding flags — additive & optional; absent in older saves.
    if (obj.trainingComplete === true) store.trainingComplete = true;
    if (obj.trainingSeen === true) store.trainingSeen = true;

    return store;
}

// Mark the Training Shift as completed (immutable). Also implies the prompt was seen.
export function markTrainingComplete(store: RecordsStore): RecordsStore {
    return { ...store, trainingComplete: true, trainingSeen: true };
}

// Mark that the player has seen the first-launch training prompt (immutable),
// so we never auto-prompt again even if they skip.
export function markTrainingSeen(store: RecordsStore): RecordsStore {
    if (store.trainingSeen) return store;
    return { ...store, trainingSeen: true };
}

// Whether to auto-offer the Training Shift: brand-new player who hasn't seen the
// prompt and has no play history yet.
export function shouldPromptTraining(store: RecordsStore): boolean {
    if (store.trainingSeen || store.trainingComplete) return false;
    const played = store.global.totalSimulations > 0 || (store.endless?.runs ?? 0) > 0;
    return !played;
}

// Apply a completed simulation to the store, returning a NEW store (immutable).
// `now` is injected so logic stays deterministic and testable.
export function applyResult(
    store: RecordsStore,
    level: Level,
    result: SimulationResult,
    now: number,
): { store: RecordsStore; improvements: RecordImprovements } {
    const rank = getRank(result.overallScore, level.parScore);
    const prev = store.missions[level.id] ?? createEmptyMissionRecord();

    const improvements: RecordImprovements = {
        newBestScore: result.overallScore > prev.bestScore,
        newBestFansServed: result.realFansServed > prev.bestFansServed,
        newBestStability: result.siteStability > prev.bestStability,
        newBestFairness: result.fairness > prev.bestFairness,
        newBestCheckout: result.checkoutSuccessRate > prev.bestCheckout,
        newBestBotsBlocked: result.botsBlockedPct > prev.bestBotsBlocked,
        newlyMastered: rank.tier === 4 && !prev.mastered,
        firstClear: result.passed && prev.clears === 0,
        anyImprovement: false,
    };
    // "attempts" always counts; a brand-new record still isn't an "improvement" banner
    // unless a specific best rose. We treat first-ever play with a positive score as an improvement.
    const isFirstAttempt = prev.attempts === 0;

    const next: MissionRecord = {
        bestScore: Math.max(prev.bestScore, result.overallScore),
        bestMedalTier: (Math.max(prev.bestMedalTier, rank.tier) as MissionRecord['bestMedalTier']),
        bestFansServed: Math.max(prev.bestFansServed, result.realFansServed),
        bestFansServedPct: Math.max(prev.bestFansServedPct, result.fansServedPct),
        bestStability: Math.max(prev.bestStability, result.siteStability),
        bestFairness: Math.max(prev.bestFairness, result.fairness),
        bestCheckout: Math.max(prev.bestCheckout, result.checkoutSuccessRate),
        bestBotsBlocked: Math.max(prev.bestBotsBlocked, result.botsBlockedPct),
        attempts: prev.attempts + 1,
        clears: prev.clears + (result.passed ? 1 : 0),
        mastered: prev.mastered || rank.tier === 4,
        lastPlayed: now,
    };

    improvements.anyImprovement =
        improvements.newBestScore ||
        improvements.newBestFansServed ||
        improvements.newBestStability ||
        improvements.newBestFairness ||
        improvements.newBestCheckout ||
        improvements.newBestBotsBlocked ||
        improvements.newlyMastered ||
        (isFirstAttempt && result.overallScore > 0);

    const global: GlobalStats = {
        highestScore: Math.max(store.global.highestScore, result.overallScore),
        totalSimulations: store.global.totalSimulations + 1,
        totalClears: store.global.totalClears + (result.passed ? 1 : 0),
        totalMastered: store.global.totalMastered + (rank.tier === 4 ? 1 : 0),
        lastPlayed: now,
    };

    // Spread the previous store FIRST: a campaign run must never drop the other
    // record families (endless, daily, onboarding flags) that live alongside
    // missions/global in the same versioned store.
    const nextStore: RecordsStore = {
        ...store,
        version: RECORDS_VERSION,
        missions: { ...store.missions, [level.id]: next },
        global,
    };

    return { store: nextStore, improvements };
}

// Derive the single next objective for a mission from its current record.
// Always returns a goal — even a mastered mission gets a "push higher" style goal.
export function nextGoal(level: Level, record: MissionRecord | undefined): MissionGoal {
    const par = level.parScore;

    // Never attempted / never cleared → clear it first.
    if (!record || record.clears === 0) {
        return { key: 'clear', label: 'Clear Mission', detail: `Reach ${par} to clear.` };
    }

    // Cleared but not strong clear (tier < 3) → push to strong clear.
    if (record.bestMedalTier < 3) {
        return { key: 'strong', label: 'Reach Strong Clear', detail: `Score ${par + 10}+ for STRONG CLEAR.` };
    }

    // Strong clear but not mastered → master it.
    if (record.bestMedalTier < 4) {
        return { key: 'master', label: 'Master Mission', detail: `Score ${par + 20}+ to MASTER.` };
    }

    // Mastered → surface the weakest metric to keep pushing, else beat best score.
    // Compare best metric records against sensible ceilings; pick the lowest headroom-worthy one.
    const candidates: MissionGoal[] = [];
    if (record.bestFansServedPct < 90) {
        candidates.push({ key: 'fans', label: 'Serve More Fans', detail: `Best ${record.bestFansServedPct}% of seats — push higher.` });
    }
    if (record.bestStability < 90) {
        candidates.push({ key: 'stability', label: 'Improve Stability', detail: `Best stability ${record.bestStability} — aim higher.` });
    }
    if (record.bestFairness < 95) {
        candidates.push({ key: 'fairness', label: 'Improve Fairness', detail: `Best fairness ${record.bestFairness} — aim higher.` });
    }
    if (record.bestBotsBlocked < 95) {
        candidates.push({ key: 'bots', label: 'Reduce Bot Leakage', detail: `Best ${record.bestBotsBlocked}% blocked — tighten defense.` });
    }
    if (record.bestCheckout < 90) {
        candidates.push({ key: 'checkout', label: 'Improve Checkout Rate', detail: `Best checkout ${record.bestCheckout}% — smooth it out.` });
    }

    if (candidates.length > 0) {
        // Deterministic: order already reflects priority (fans → stability → fairness → bots → checkout).
        return candidates[0];
    }

    return { key: 'beat', label: 'Beat Best Score', detail: `Top your best of ${record.bestScore}.` };
}

// Distinct-mission summary for the Operator Record panel.
export function deriveOperatorSummary(store: RecordsStore): OperatorSummary {
    let missionsCleared = 0;
    let missionsMastered = 0;
    for (const id of VALID_LEVEL_IDS) {
        const rec = store.missions[id];
        if (!rec) continue;
        if (rec.clears > 0) missionsCleared++;
        if (rec.mastered) missionsMastered++;
    }
    return {
        highestScore: store.global.highestScore,
        missionsCleared,
        missionsMastered,
        totalRuns: store.global.totalSimulations,
        lastPlayed: store.global.lastPlayed,
    };
}

// Best scores map (LevelId → best score) for unlock restoration on load.
export function bestScoresFromStore(store: RecordsStore): Partial<Record<LevelId, number>> {
    const out: Partial<Record<LevelId, number>> = {};
    for (const id of VALID_LEVEL_IDS) {
        const rec = store.missions[id];
        if (rec && rec.attempts > 0) out[id] = rec.bestScore;
    }
    return out;
}

// Apply an endless run result to the store (immutable). `now` injected for tests.
export function applyEndlessResult(
    store: RecordsStore,
    result: EndlessRunResult,
    now: number,
): { store: RecordsStore; improvements: EndlessImprovements } {
    const prev = store.endless ?? createEmptyEndlessRecord();

    const improvements: EndlessImprovements = {
        newLongestShift: result.timeSurvived > prev.longestShift,
        newHighestScore: result.operatorScore > prev.highestScore,
        newHighestCombo: result.highestCombo > prev.highestCombo,
        newMostFansServed: result.fansServed > prev.mostFansServed,
        anyImprovement: false,
    };
    improvements.anyImprovement =
        improvements.newLongestShift || improvements.newHighestScore ||
        improvements.newHighestCombo || improvements.newMostFansServed;

    const next: EndlessRecord = {
        longestShift: Math.max(prev.longestShift, result.timeSurvived),
        highestScore: Math.max(prev.highestScore, result.operatorScore),
        highestCombo: Math.max(prev.highestCombo, result.highestCombo),
        mostFansServed: Math.max(prev.mostFansServed, result.fansServed),
        bestStability: Math.max(prev.bestStability, result.stability),
        bestFairness: Math.max(prev.bestFairness, result.fairness),
        runs: prev.runs + 1,
        lastPlayed: now,
        totalDecisionsCorrect: prev.totalDecisionsCorrect + result.decisionsCorrect,
        totalDecisionsWrong: prev.totalDecisionsWrong + result.decisionsWrong,
        totalDecisionsIgnored: prev.totalDecisionsIgnored + result.decisionsIgnored,
        bestCorrectStreak: Math.max(prev.bestCorrectStreak, result.longestCorrectStreak),
    };

    return { store: { ...store, endless: next }, improvements };
}

// Operational accuracy % across all recorded decisions (correct / answered).
// Returns null when no decisions have ever been answered.
export function operationalAccuracy(endless: EndlessRecord | undefined): number | null {
    if (!endless) return null;
    const answered = endless.totalDecisionsCorrect + endless.totalDecisionsWrong;
    if (answered === 0) return null;
    return Math.round((endless.totalDecisionsCorrect / answered) * 100);
}

// ---------- Daily Challenge records ----------

/**
 * Apply one Daily Challenge run (immutable). `dateKey` is the LOCAL calendar day
 * being played, `targetScore` today's generated target, `now` injected for tests.
 *
 * Streak rules (per spec):
 *   * Only the FIRST clear of a calendar day counts — repeats never inflate it.
 *   * Clearing on the day after the last-cleared day extends the streak; any gap
 *     resets it to 1 on the next clear.
 * "Today" fields roll over automatically when a new dateKey arrives.
 */
export function applyDailyResult(
    store: RecordsStore,
    dateKey: string,
    result: SimulationResult,
    targetScore: number,
    now: number,
): { store: RecordsStore; newDailyBest: boolean; firstClearToday: boolean } {
    const prev = store.daily ?? createEmptyDailyRecord();

    // Roll the today-fields over when the calendar day changed since last play.
    const today: DailyRecord = prev.dateKey === dateKey ? { ...prev } : {
        ...prev,
        dateKey,
        attemptsToday: 0,
        bestScoreToday: 0,
        bestMedalTierToday: 0,
        completedToday: false,
        bestConfigToday: undefined,
    };

    today.attemptsToday += 1;
    today.lastPlayed = now;

    const score = result.overallScore;
    const passed = score >= targetScore;
    const newDailyBest = score > today.bestScoreToday;
    if (newDailyBest) {
        today.bestScoreToday = score;
        today.bestMedalTierToday = getRank(score, targetScore).tier;
        today.bestConfigToday = result.config;
    }

    let firstClearToday = false;
    if (passed && !today.completedToday) {
        firstClearToday = true;
        today.completedToday = true;
        today.totalCompleted = prev.totalCompleted + 1;
        // Streak: consecutive local days extend; a gap restarts at 1. A repeated
        // same-day clear can't reach here (completedToday guards it).
        today.currentStreak = prev.lastCompletedDateKey && isNextCalendarDay(prev.lastCompletedDateKey, dateKey)
            ? prev.currentStreak + 1
            : 1;
        today.longestStreak = Math.max(prev.longestStreak, today.currentStreak);
        today.lastCompletedDateKey = dateKey;
    }

    return { store: { ...store, daily: today }, newDailyBest, firstClearToday };
}

/**
 * The streak to DISPLAY for `todayKey`. The stored currentStreak describes the
 * run ending at lastCompletedDateKey; it only still stands if that day is today
 * (cleared already) or yesterday (alive, pending today's clear). Otherwise the
 * chain is broken and shows as 0 until the next clear starts a new one.
 */
export function effectiveDailyStreak(daily: DailyRecord | undefined, todayKey: string): number {
    if (!daily || !daily.lastCompletedDateKey) return 0;
    if (daily.lastCompletedDateKey === todayKey) return daily.currentStreak;
    if (isNextCalendarDay(daily.lastCompletedDateKey, todayKey)) return daily.currentStreak;
    return 0;
}

// Derive campaign completion state. `parScores` maps LevelId → par so we can
// count distinct clears without importing level data (keeps this pure).
export function deriveCampaignStatus(
    store: RecordsStore,
    parScores: Record<LevelId, number>,
): CampaignStatus {
    let missionsCleared = 0;
    let missionsMastered = 0;
    let strongClears = 0;

    for (const id of VALID_LEVEL_IDS) {
        const rec = store.missions[id];
        if (!rec) continue;
        if (rec.clears > 0) missionsCleared++;
        if (rec.mastered) missionsMastered++;
        // Strong clear = best medal tier 3 (STRONG CLEAR) or 4 (MASTERED).
        if (rec.bestMedalTier >= 3) strongClears++;
    }

    const complete = missionsCleared >= VALID_LEVEL_IDS.length;

    // Operator rank scales with mastery depth once the campaign is complete.
    let operatorRank = 'Trainee Operator';
    let overallRating = 'Campaign in progress.';
    if (complete) {
        if (missionsMastered === 5) {
            operatorRank = 'Onsale Grandmaster';
            overallRating = 'Every mission mastered. Flawless command of the queue.';
        } else if (missionsMastered >= 3) {
            operatorRank = 'Senior Onsale Director';
            overallRating = 'Commanding performance across the campaign.';
        } else if (strongClears >= 3) {
            operatorRank = 'Onsale Director';
            overallRating = 'Strong, reliable command under pressure.';
        } else if (missionsMastered >= 1 || strongClears >= 1) {
            operatorRank = 'Operations Lead';
            overallRating = 'Campaign cleared — real mastery is within reach.';
        } else {
            operatorRank = 'Certified Operator';
            overallRating = 'Every mission cleared. Now chase the higher medals.';
        }
    }

    return {
        complete,
        missionsCleared,
        strongClears,
        missionsMastered,
        highestScore: store.global.highestScore,
        totalRuns: store.global.totalSimulations,
        operatorRank,
        overallRating,
    };
}

// ---------- localStorage adapter (never throws) ----------

function getStorage(): Storage | null {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage;
    } catch {
        return null;
    }
}

export function loadRecords(): RecordsStore {
    const storage = getStorage();
    if (!storage) return createEmptyStore();
    try {
        const raw = storage.getItem(RECORDS_STORAGE_KEY);
        if (!raw) return createEmptyStore();
        const parsed = JSON.parse(raw);
        return parseStore(parsed);
    } catch {
        return createEmptyStore();
    }
}

export function saveRecords(store: RecordsStore): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(store));
    } catch {
        // Quota exceeded / private mode — silently ignore, game still playable in-memory.
    }
}

export function resetRecords(): RecordsStore {
    const storage = getStorage();
    if (storage) {
        try {
            storage.removeItem(RECORDS_STORAGE_KEY);
        } catch {
            // ignore
        }
    }
    return createEmptyStore();
}
