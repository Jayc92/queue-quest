import type { Level, SimulationResult, Rank } from './types';

export interface PrimaryCause {
    label: string;
    detail: string;
}

// A per-metric debrief entry: what went wrong, why, and the concrete next move.
export interface MetricDiagnostic {
    label: string;
    severity: 'warning' | 'danger';
    why: string;    // what happened + which choice drove it
    fix: string;    // the specific adjustment to try next
}

// Diagnose every metric that landed below its healthy band, ordered by how much
// it hurt the score (weighted deficit). Each entry ties the outcome to the
// actual config choice and names the concrete adjustment to try — so a player
// always knows why a metric fell and what to do about it. Returns [] when every
// metric is healthy. Callers cap the list to keep the debrief concise.
export function metricDiagnostics(results: SimulationResult, level: Level): MetricDiagnostic[] {
    const c = results.config;
    const frictionHeavy = c.botDetection === 'aggressive' || c.verification === 'verified';

    // healthy = "good" band from ResultsScreen; warn = danger cutoff.
    const specs = [
        { key: 'fans',     label: 'Fans Served',   value: results.fansServedPct,       weight: level.weights.fans,         good: 50, warn: 25 },
        { key: 'bots',     label: 'Bots Blocked',  value: results.botsBlockedPct,      weight: level.weights.bots,         good: 70, warn: 50 },
        { key: 'checkout', label: 'Checkout Rate', value: results.checkoutSuccessRate, weight: level.weights.checkout,     good: 70, warn: 50 },
        { key: 'sat',      label: 'Satisfaction',  value: results.satisfaction,        weight: level.weights.satisfaction, good: 65, warn: 45 },
        { key: 'stab',     label: 'Stability',     value: results.siteStability,       weight: level.weights.stability,    good: 60, warn: 40 },
        { key: 'fair',     label: 'Fairness',      value: results.fairness,            weight: level.weights.fairness,     good: 70, warn: 50 },
    ] as const;

    const out: MetricDiagnostic[] = [];
    for (const s of specs) {
        if (s.value >= s.good) continue;   // healthy — nothing to flag
        const severity: MetricDiagnostic['severity'] = s.value < s.warn ? 'danger' : 'warning';
        out.push({ label: s.label, severity, ...explain(s.key, results, level, frictionHeavy) });
    }
    // Worst offenders first, by weighted shortfall below the healthy band.
    return out.sort((a, b) => deficit(b, specs) - deficit(a, specs));
}

function deficit(d: MetricDiagnostic, specs: readonly { label: string; value: number; weight: number; good: number }[]): number {
    const s = specs.find(x => x.label === d.label);
    return s ? (s.good - s.value) * s.weight : 0;
}

// Config-aware why + fix per metric. Kept terse (one sentence each).
function explain(key: string, results: SimulationResult, level: Level, frictionHeavy: boolean): { why: string; fix: string } {
    const c = results.config;
    switch (key) {
        case 'fans':
            if (frictionHeavy) return { why: 'Heavy verification and screening turned real fans away at the door.', fix: 'Ease Verification or Bot Detection one step so more genuine fans get through.' };
            if (results.checkoutSuccessRate < 60) return { why: 'Checkout kept failing, so fans never completed their purchase.', fix: 'Stabilize load (add an entry wave) so checkout stops timing out.' };
            if (c.presalePercent > 30) return { why: `A ${c.presalePercent}% presale left too few public seats for the general onsale.`, fix: 'Lower presale toward 20% to reopen the public pool.' };
            return { why: 'Too few real fans reached a ticket.', fix: 'Reduce friction and shore up stability so more fans convert.' };
        case 'bots':
            if (c.botDetection === 'low' || c.botDetection === 'medium') return { why: `${c.botDetection === 'low' ? 'Basic' : 'Standard'} bot detection was overrun at this threat level.`, fix: 'Raise Bot Detection at least one step.' };
            return { why: 'Enough bots slipped through to skew the pool.', fix: 'Add fan verification (Email or ID) to close the gap.' };
        case 'checkout':
            if (c.waveCount === 1) return { why: 'A single-wave open concentrated all load, so checkout buckled.', fix: 'Split entry into 2–4 waves to spread the load.' };
            if (frictionHeavy) return { why: 'Stacked verification friction slowed checkout to a crawl.', fix: 'Lighten Verification or Bot Detection one step.' };
            return { why: 'Load pressure pushed checkout past its limit.', fix: 'Add an entry wave or ease friction to steady checkout.' };
        case 'sat':
            if (c.botDetection === 'aggressive') return { why: 'Maximum bot screening created false positives that frustrated fans.', fix: 'Drop Bot Detection to Enhanced.' };
            if (c.verification === 'verified' && level.botPressure < 0.5) return { why: 'ID verification was overkill for this bot level and annoyed fans.', fix: 'Downgrade Verification to Email.' };
            if (c.waitingRoomTime > 6) return { why: `A ${c.waitingRoomTime}h waiting room made fans wait too long.`, fix: 'Shorten the waiting room toward 1–2h.' };
            return { why: 'Cumulative friction wore fans down.', fix: 'Reduce friction across detection and verification.' };
        case 'stab':
            if (c.waveCount === 1) return { why: 'One wave sent the whole crowd at the server at once.', fix: 'Add entry waves (2–4) to stagger the load.' };
            if (c.waveCount > 5) return { why: `${c.waveCount} waves caused repeated restarts that stressed the system.`, fix: 'Reduce to 3–4 waves.' };
            return { why: 'Server load ran hotter than capacity could hold.', fix: 'Add a wave, or raise presale slightly to shed public-sale load.' };
        case 'fair':
            if (c.resale === 'none' && level.resalePressure > 0.5) return { why: 'Open resale let scalpers flip inventory instantly.', fix: 'Restrict resale to Cap or Face Value.' };
            if (c.purchaseLimit > 4) return { why: `A ${c.purchaseLimit}-ticket limit let buyers grab large blocks.`, fix: 'Lower the purchase limit toward 2.' };
            if (c.presalePercent > 30) return { why: `A ${c.presalePercent}% presale skewed access away from the public.`, fix: 'Trim presale toward 20%.' };
            if (c.accessiblePercent <= 2) return { why: 'Thin accessible coverage dragged fairness down.', fix: 'Raise accessible seats to at least 5%.' };
            return { why: 'Distribution tilted away from everyday fans.', fix: 'Tighten resale or lower the purchase limit.' };
        default:
            return { why: 'This metric fell below its healthy range.', fix: 'Adjust the related control and re-run.' };
    }
}

export function primaryFailureCause(results: SimulationResult, level: Level): PrimaryCause | null {
    const metrics = [
        { key: 'fans',         label: 'Fans Served',   value: results.fansServedPct,       weight: level.weights.fans,         threshold: 30 },
        { key: 'bots',         label: 'Bots Blocked',  value: results.botsBlockedPct,      weight: level.weights.bots,         threshold: 55 },
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
