import { useEffect, useState } from 'react';
import type { Level, SimulationResult, IconName } from '../game/types';
import { getRank, nextRankThreshold } from '../game/ranks';
import { generateRecommendation, primaryFailureCause } from '../game/recommendations';
import { Icon } from '../components/ui/Icon';
import { MedalBadge } from '../components/ui/primitives';

interface Props {
    level: Level;
    results: SimulationResult;
    onAdjust: () => void;
    onResetTry: () => void;
    onNextLevel: () => void;
    onLevelSelect: () => void;
    hasNextLevel: boolean;
    isNewBest: boolean;
}

export function ResultsScreen({ level, results, onAdjust, onResetTry, onNextLevel, onLevelSelect, hasNextLevel, isNewBest }: Props) {
    const [showDetails, setShowDetails] = useState(false);
    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const t = setTimeout(() => setShowDetails(true), reduced ? 50 : 500);
        return () => clearTimeout(t);
    }, []);

    const rank = getRank(results.overallScore, level.parScore);
    const nextThreshold = nextRankThreshold(results.overallScore, level.parScore);
    const recommendation = generateRecommendation(results, level, rank);
    const primaryCause = !results.passed ? primaryFailureCause(results, level) : null;
    const sortedImpacts = [...results.leverImpacts].sort((a, b) => b.impact - a.impact);
    const bestDecision = sortedImpacts[0];
    const worstDecision = sortedImpacts[sortedImpacts.length - 1];

    const getMetricStatus = (value: number, thresholds: { good: number; warn: number }): 'good' | 'warning' | 'danger' => {
        if (value >= thresholds.good) return 'good';
        if (value >= thresholds.warn) return 'warning';
        return 'danger';
    };

    const metrics: { label: string; displayValue: string; displayMax?: number; pct: number; icon: IconName; status: 'good' | 'warning' | 'danger' }[] = [
        { label: 'Fans Served', displayValue: results.realFansServed.toLocaleString(), displayMax: results.totalSeats, pct: results.fansServedPct, icon: 'Users', status: getMetricStatus(results.fansServedPct, { good: 50, warn: 25 }) },
        { label: 'Bots Blocked', displayValue: `${results.botsBlockedPct}%`, pct: results.botsBlockedPct, icon: 'Shield', status: getMetricStatus(results.botsBlockedPct, { good: 70, warn: 50 }) },
        { label: 'Checkout Rate', displayValue: `${results.checkoutSuccessRate}%`, pct: results.checkoutSuccessRate, icon: 'Check', status: getMetricStatus(results.checkoutSuccessRate, { good: 70, warn: 50 }) },
        { label: 'Satisfaction', displayValue: `${results.satisfaction}`, pct: results.satisfaction, icon: 'Heart', status: getMetricStatus(results.satisfaction, { good: 65, warn: 45 }) },
        { label: 'Stability', displayValue: `${results.siteStability}`, pct: results.siteStability, icon: 'Server', status: getMetricStatus(results.siteStability, { good: 60, warn: 40 }) },
        { label: 'Fairness', displayValue: `${results.fairness}`, pct: results.fairness, icon: 'Scale', status: getMetricStatus(results.fairness, { good: 70, warn: 50 }) },
    ];

    const rankBorder: Record<string, string> = {
        red: 'border-red-500/50', amber: 'border-amber-500/50',
        green: 'border-green-500/50', cyan: 'border-cyan-500/50', gold: 'border-amber-400/50',
    };
    const rankBg: Record<string, string> = {
        red: 'bg-red-500/10', amber: 'bg-amber-500/10',
        green: 'bg-green-500/10', cyan: 'bg-cyan-500/10', gold: 'bg-amber-400/10',
    };
    const rankText: Record<string, string> = {
        red: 'text-red-400', amber: 'text-amber-400',
        green: 'text-green-400', cyan: 'text-cyan-400', gold: 'text-amber-300',
    };

    return (
        <div className="min-h-screen grid-bg p-3 md:p-6">
            <div className="max-w-4xl mx-auto">
                <div className={`panel mb-4 overflow-hidden ${rankBorder[rank.color]}`}>
                    <div className={`p-4 md:p-5 ${rankBg[rank.color]}`}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 md:gap-4">
                                <MedalBadge rank={rank} size="md" />
                                <div>
                                    <div className={`text-xs font-mono uppercase tracking-wider ${rankText[rank.color]}`}>
                                        {results.passed ? 'Objective Achieved' : 'Mission Failed'}
                                    </div>
                                    <div className="text-3xl md:text-4xl font-bold text-white font-mono tabular-nums">
                                        {results.overallScore}
                                        <span className="text-lg md:text-xl text-slate-500"> / {level.parScore}</span>
                                    </div>
                                    {isNewBest && <div className="text-xs font-mono text-amber-300 mt-0.5 animate-blink">NEW BEST SCORE</div>}
                                    {nextThreshold && (
                                        <div className="text-[11px] text-slate-400 mt-1">
                                            +{nextThreshold.needed} to <span className="font-mono font-bold text-cyan-400">{nextThreshold.label}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {results.passed && hasNextLevel && (
                                <div className="px-3 py-1.5 rounded border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 text-xs font-mono uppercase tracking-wider">
                                    Next Mission Unlocked
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {showDetails && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                            {metrics.map((m, i) => {
                                const colors = { good: { text: 'text-green-400', bar: 'bg-green-500' }, warning: { text: 'text-amber-400', bar: 'bg-amber-500' }, danger: { text: 'text-red-400', bar: 'bg-red-500' } }[m.status];
                                return (
                                    <div key={i} className="panel p-3">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400">{m.label}</span>
                                            <span className={colors.text}><Icon name={m.icon} className="w-3.5 h-3.5" /></span>
                                        </div>
                                        <div className={`text-xl md:text-2xl font-bold ${colors.text} font-mono tabular-nums truncate`}>
                                            {m.displayValue}
                                            {m.displayMax && <span className="text-xs text-slate-500"> / {m.displayMax.toLocaleString()}</span>}
                                        </div>
                                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                                            <div className={`h-full ${colors.bar} transition-all duration-700`} style={{ width: `${m.pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {results.trace.length > 0 && (
                            <div className="panel mb-4">
                                <div className="panel-header">
                                    <span className="text-xs uppercase tracking-wider font-semibold">Simulation Trace</span>
                                </div>
                                <div className="p-3 space-y-1.5">
                                    {results.trace.map((tr, i) => {
                                        const toneClass = { red: 'text-red-400', amber: 'text-amber-400', green: 'text-green-400', cyan: 'text-cyan-400' }[tr.tone];
                                        return (
                                            <div key={i} className="flex items-start gap-2 text-xs">
                                                <span className={`${toneClass} font-mono mt-0.5`}>▸</span>
                                                <div className="min-w-0">
                                                    <span className={`font-mono text-[10px] uppercase tracking-wider ${toneClass}`}>{tr.label}</span>
                                                    <span className="text-slate-300 ml-2">{tr.detail}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="panel mb-4">
                            <div className="panel-header">
                                <span className="text-xs uppercase tracking-wider font-semibold">Operations Debrief</span>
                            </div>
                            <div className="p-4 space-y-3">
                                {primaryCause && (
                                    <div className="flex items-start gap-3 p-3 rounded border border-red-500/30 bg-red-500/5">
                                        <span className="text-red-400 shrink-0 mt-0.5"><Icon name="Alert" className="w-4 h-4" /></span>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-mono uppercase tracking-wider text-red-400 mb-0.5">Primary Failure Cause</div>
                                            <div className="text-sm text-white">{primaryCause.label} fell below target. {primaryCause.detail}</div>
                                        </div>
                                    </div>
                                )}
                                <div className="grid md:grid-cols-2 gap-3">
                                    {bestDecision && bestDecision.impact > 0 && (
                                        <div className="flex items-start gap-3 p-3 rounded border border-green-500/30 bg-green-500/5">
                                            <span className="text-green-400 shrink-0 mt-0.5"><Icon name="Check" className="w-4 h-4" /></span>
                                            <div className="min-w-0">
                                                <div className="text-[10px] font-mono uppercase tracking-wider text-green-400 mb-0.5">Best Decision</div>
                                                <div className="text-sm text-white font-semibold">{bestDecision.lever}: {bestDecision.label}</div>
                                                <div className="text-xs text-slate-400 mt-0.5">{bestDecision.why}</div>
                                            </div>
                                        </div>
                                    )}
                                    {worstDecision && worstDecision.impact < 0 && (
                                        <div className="flex items-start gap-3 p-3 rounded border border-amber-500/30 bg-amber-500/5">
                                            <span className="text-amber-400 shrink-0 mt-0.5"><Icon name="X" className="w-4 h-4" /></span>
                                            <div className="min-w-0">
                                                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-0.5">Most Costly Decision</div>
                                                <div className="text-sm text-white font-semibold">{worstDecision.lever}: {worstDecision.label}</div>
                                                <div className="text-xs text-slate-400 mt-0.5">{worstDecision.why}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-start gap-3 p-3 rounded border border-cyan-500/30 bg-cyan-500/5">
                                    <span className="text-cyan-400 shrink-0 mt-0.5"><Icon name="Target" className="w-4 h-4" /></span>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 mb-0.5">Recommended Adjustment</div>
                                        <div className="text-sm text-white">{recommendation}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="grid grid-cols-2 md:flex md:flex-wrap md:justify-center gap-2 md:gap-3">
                    <button onClick={onAdjust} className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded font-semibold text-sm transition-all">
                        <Icon name="Activity" className="w-4 h-4" /><span>Adjust Setup</span>
                    </button>
                    <button onClick={onResetTry} className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-sm transition-all border border-slate-700">
                        <Icon name="Refresh" className="w-4 h-4" /><span>Reset Setup</span>
                    </button>
                    <button onClick={onLevelSelect} className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-sm transition-all border border-slate-700">
                        <Icon name="Layers" className="w-4 h-4" /><span>Missions</span>
                    </button>
                    {results.passed && hasNextLevel && (
                        <button
                            onClick={onNextLevel}
                            className="col-span-2 md:col-span-1 flex items-center justify-center gap-2 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 font-bold text-sm rounded transition-all glow-cyan"
                            style={{ color: '#0a0e14' }}
                        >
                            <span>Next Mission</span>
                            <Icon name="ArrowRight" className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
