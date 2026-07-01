import type { Rank, NextRankThreshold } from './types';

export function getRank(score: number, target: number): Rank {
    const diff = score - target;
    if (diff < -15) return { key: 'fail',      label: 'FAILED',       color: 'red',   tier: 0 };
    if (diff < 0)   return { key: 'near',      label: 'NEAR MISS',    color: 'amber', tier: 1 };
    if (diff < 10)  return { key: 'pass',      label: 'CLEAR',        color: 'green', tier: 2 };
    if (diff < 20)  return { key: 'excellent', label: 'STRONG CLEAR', color: 'cyan',  tier: 3 };
    return           { key: 'mastered', label: 'MASTERED',     color: 'gold',  tier: 4 };
}

export function nextRankThreshold(currentScore: number, target: number): NextRankThreshold | null {
    const diff = currentScore - target;
    if (diff < 0)  return { needed: target - currentScore, label: 'CLEAR' };
    if (diff < 10) return { needed: (target + 10) - currentScore, label: 'STRONG CLEAR' };
    if (diff < 20) return { needed: (target + 20) - currentScore, label: 'MASTERED' };
    return null;
}

export function formatNumber(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
