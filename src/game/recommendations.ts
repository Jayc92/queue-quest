import type { Level, SimulationResult, Rank } from './types';

export interface PrimaryCause {
    label: string;
    detail: string;
}

export function primaryFailureCause(results: SimulationResult, level: Level): PrimaryCause | null {
    const metrics = [
        { key: 'fans',         label: 'Fans Served',   value: results.fansServedPct,       weight: level.weights.fans,         threshold: 30 },
        { key: 'bots',         label: 'Bot Defense',   value: results.botsBlockedPct,      weight: level.weights.bots,         threshold: 55 },
        { key: 'checkout',     label: 'Checkout',      value: results.checkoutSuccessRate, weight: level.weights.checkout,     threshold: 60 },
        { key: 'satisfaction', label: 'Satisfaction',  value: results.satisfaction,        weight: level.weights.satisfaction, threshold: 55 },
        { key: 'stability',    label: 'Site Stability',value: results.siteStability,       weight: level.weights.stability,    threshold: 55 },
        { key: 'fairness',     label: 'Fairness',      value: results.fairness,            weight: level.weights.fairness,     threshold: 55 },
    ];
    const worst = metrics
        .map(m => ({ ...m, deficit: (m.threshold - m.value) * m.weight }))
        .filter(m => m.deficit > 0)
        .sort((a, b) => b.deficit - a.deficit)[0];
    if (!worst) return null;

    let detail = '';
    if (worst.key === 'stability' && results.serverLoad > 70) detail = 'Server load exceeded capacity.';
    else if (worst.key === 'satisfaction') detail = 'Legitimate fans were frustrated by friction and checkout failures.';
    else if (worst.key === 'fairness') detail = 'Distribution felt lopsided — scalpers, groups, or presale absorbed too much.';
    else if (worst.key === 'fans') detail = 'Too few real fans made it through the queue.';
    else if (worst.key === 'bots') detail = 'Bots grabbed a large share of tickets.';
    else if (worst.key === 'checkout') detail = 'Checkout failures cost fans their spot in queue.';

    return { label: worst.label, detail };
}

export function generateRecommendation(results: SimulationResult, level: Level, rank: Rank): string {
    const c = results.config;
    const fansPct = results.fansServedPct;

    if (results.passed) {
        if (rank.tier >= 4) return 'Mastered. Try a tougher mission or a different strategy for style points.';
        if (rank.tier === 3) return 'Strong clear. Push satisfaction and stability higher for MASTERED.';
        if (results.satisfaction < 75) return 'Cleared. Reduce friction (lighter verification or detection) to push satisfaction toward STRONG CLEAR.';
        if (results.siteStability < 70) return 'Cleared. Add another entry wave to strengthen stability toward STRONG CLEAR.';
        if (results.fairness < 80) return 'Cleared. Tighten purchase limit or resale policy to push fairness higher.';
        return 'Cleared. Try trimming presale allocation or adding accessibility coverage for STRONG CLEAR.';
    }

    if (results.siteStability < 55 && c.waveCount < 3) {
        return `Add entry waves. A ${c.waveCount === 1 ? 'single wave' : 'small number of waves'} caused a load spike.`;
    }
    if (results.siteStability < 55 && c.waveCount > 5) {
        return 'Reduce entry waves. Too many waves are causing repeated stress on the system.';
    }
    if (results.botsBlockedPct < 55 && c.botDetection === 'low') {
        return 'Raise bot detection at least one step. Basic CAPTCHA is not enough for this threat level.';
    }
    if (results.botsBlockedPct < 60 && c.botDetection === 'medium' && level.botPressure > 0.4) {
        return 'Raise bot detection to Enhanced. Standard rate limits are getting overwhelmed.';
    }
    if (results.satisfaction < 55 && c.botDetection === 'aggressive') {
        return 'Lower bot detection one step. Aggressive filtering blocked bots but created too much fan friction.';
    }
    if (results.satisfaction < 55 && c.verification === 'verified' && level.botPressure < 0.5) {
        return 'Downgrade verification to Email. ID checks are overkill at this bot level and are hurting satisfaction.';
    }
    if (fansPct < 30 && c.presalePercent > 30) {
        return `Reduce presale allocation. ${c.presalePercent}% presale left public inventory too thin.`;
    }
    if (results.fairness < 55 && c.resale === 'none' && level.resalePressure > 0.5) {
        return 'Tighten resale restrictions. Resale pressure overwhelmed fairness — try Face Value or Cap.';
    }
    if (results.fairness < 55 && c.purchaseLimit > 4) {
        return `Lower the purchase limit. ${c.purchaseLimit} tickets per buyer is enabling bulk buying.`;
    }
    if (c.accessiblePercent <= 2) {
        return 'Add accessible coverage. Reserved inventory materially improves the fairness score.';
    }
    if (c.waitingRoomTime > 6) {
        return `Reduce waiting room time. ${c.waitingRoomTime}h opens the door too long for bots to prepare.`;
    }
    if (results.checkoutSuccessRate < 60) {
        return 'Checkout is choking. Reduce friction (lighter verification) or add waves to stabilize load.';
    }
    // Metric-specific fallback
    const metrics = [
        { label: 'Fans Served',  value: results.fansServedPct,       fix: 'Reduce friction or improve checkout stability so more real fans complete.' },
        { label: 'Satisfaction', value: results.satisfaction,        fix: 'Reduce verification friction or loosen overly strict controls.' },
        { label: 'Stability',    value: results.siteStability,       fix: 'Add waves or reduce repeated load spikes to strengthen stability.' },
        { label: 'Fairness',     value: results.fairness,            fix: 'Tighten resale, lower purchase limits, or shrink presale allocation.' },
        { label: 'Bots Blocked', value: results.botsBlockedPct,      fix: 'Raise bot detection level or add fan verification.' },
        { label: 'Checkout',     value: results.checkoutSuccessRate, fix: 'Reduce cumulative friction or add wave staggering.' },
    ];
    const weakest = metrics.sort((a, b) => a.value - b.value)[0];
    return `Your weakest metric was ${weakest.label}. ${weakest.fix}`;
}
