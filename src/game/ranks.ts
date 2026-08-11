import type { Rank, NextRankThreshold } from './types';
import { RANK } from './balance';

// Rank bands are relative to a mission's par. Values live in balance.ts (RANK).
// Deltas were tightened (from +10/+20 to +6/+12) so that MASTERED is actually
// reachable on every mission — the score ceiling on the hardest levels sits near
// par+12, and the old +20 band put mastery mathematically out of reach everywhere.
// Re-exported here so existing importers keep their entry point.
export const STRONG_CLEAR_DELTA = RANK.strongClearDelta;
export const MASTER_DELTA = RANK.masterDelta;
// A score this far below par is a clear failure (vs. a near miss just under par).
const FAIL_DELTA = RANK.failDelta;

export function getRank(score: number, target: number): Rank {
    const diff = score - target;
    if (diff < FAIL_DELTA)          return { key: 'fail',      label: 'FAILED',       color: 'red',   tier: 0 };
    if (diff < 0)                   return { key: 'near',      label: 'NEAR MISS',    color: 'amber', tier: 1 };
    if (diff < STRONG_CLEAR_DELTA)  return { key: 'pass',      label: 'CLEAR',        color: 'green', tier: 2 };
    if (diff < MASTER_DELTA)        return { key: 'excellent', label: 'STRONG CLEAR', color: 'cyan',  tier: 3 };
    return                           { key: 'mastered', label: 'MASTERED',     color: 'gold',  tier: 4 };
}

export function nextRankThreshold(currentScore: number, target: number): NextRankThreshold | null {
    const diff = currentScore - target;
    if (diff < 0)                  return { needed: target - currentScore, label: 'CLEAR' };
    if (diff < STRONG_CLEAR_DELTA) return { needed: (target + STRONG_CLEAR_DELTA) - currentScore, label: 'STRONG CLEAR' };
    if (diff < MASTER_DELTA)       return { needed: (target + MASTER_DELTA) - currentScore, label: 'MASTERED' };
    return null;
}

export function formatNumber(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
}
