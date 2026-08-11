import { useEffect, useMemo, useState } from 'react';
import type { Level, SimulationResult, IconName, MissionRecord, RecordImprovements } from '../game/types';
import { getRank, nextRankThreshold } from '../game/ranks';
import { generateRecommendation, primaryFailureCause, metricDiagnostics } from '../game/recommendations';
import { analyzeMetricCauses, summarizeRun, type MetricId, type MetricExplanation } from '../game/explanations';
import { nextGoal } from '../game/records';
import { UI } from '../game/balance';
import { Icon } from '../components/ui/Icon';
import { MedalBadge } from '../components/ui/primitives';
import { useCountUp } from '../components/ui/useCountUp';
import { ScreenTour } from '../components/tour/ScreenTour';
import { RESULTS_TOUR } from '../data/tours';

// A number that animates from 0 up to its value using the shared count-up hook.
function CountUpValue({ raw, format, delayMs = 0 }: { raw: number; format: (n: number) => string; delayMs?: number }) {
    const n = useCountUp(raw, 700, delayMs);
    return <>{format(n)}</>;
}

/** Daily Challenge context — present only when this run was today's challenge. */
export interface DailyResultInfo {
    dateKey: string;
    venueName: string;
    bestScoreToday: number;    // AFTER this run was applied
    newDailyBest: boolean;
    completedToday: boolean;
    streak: number;            // effective streak as of today
    attemptsToday: number;
    onReplayToday: () => void;
}

interface Props {
    level: Level;
    results: SimulationResult;
    record?: MissionRecord;
    improvements: RecordImprovements | null;
    daily?: DailyResultInfo;
    onAdjust: () => void;
    onResetTry: () => void;
    onNextLevel: () => void;
    onLevelSelect: () => void;
    hasNextLevel: boolean;
    campaignComplete: boolean;
    onViewCampaign: () => void;
}

// Level-specific one-line debrief summary tied to the actual outcome band.
function scenarioSummary(level: Level, results: SimulationResult): string {
    const rank = getRank(results.overallScore, level.parScore);
    if (!results.passed) return level.identity.resultSummary.fail;
    if (rank.tier >= 3) return level.identity.resultSummary.strong;
    return level.identity.resultSummary.pass;
}

// Ordered list of possible record-improvement badges.
function improvementBadges(imp: RecordImprovements | null): { label: string; icon: IconName; tone: 'gold' | 'cyan' | 'green' }[] {
    if (!imp) return [];
    const badges: { label: string; icon: IconName; tone: 'gold' | 'cyan' | 'green' }[] = [];
    if (imp.newlyMastered) badges.push({ label: 'MISSION MASTERED', icon: 'Trophy', tone: 'gold' });
    if (imp.newBestScore) badges.push({ label: 'NEW BEST SCORE', icon: 'Star', tone: 'cyan' });
    if (imp.newBestFairness) badges.push({ label: 'NEW BEST FAIRNESS', icon: 'Scale', tone: 'green' });
    if (imp.newBestStability) badges.push({ label: 'NEW BEST STABILITY', icon: 'Server', tone: 'green' });
    if (imp.newBestFansServed) badges.push({ label: 'NEW BEST FANS SERVED', icon: 'Users', tone: 'green' });
    if (imp.newBestCheckout) badges.push({ label: 'NEW BEST CHECKOUT', icon: 'Check', tone: 'green' });
    if (imp.newBestBotsBlocked) badges.push({ label: 'NEW BEST BOTS BLOCKED', icon: 'Shield', tone: 'green' });
    return badges;
}

export function ResultsScreen({ level, results, record, improvements, daily, onAdjust, onResetTry, onNextLevel, onLevelSelect, hasNextLevel, campaignComplete, onViewCampaign }: Props) {
    const [showDetails, setShowDetails] = useState(false);
    // Which metric card is expanded in the "How Your Choices Affected This Run" panel.
    const [openMetric, setOpenMetric] = useState<MetricId | null>(null);
    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const t = setTimeout(() => setShowDetails(true), reduced ? UI.resultsRevealReducedMs : UI.resultsRevealMs);
        return () => clearTimeout(t);
    }, []);

    const rank = getRank(results.overallScore, level.parScore);
    const nextThreshold = nextRankThreshold(results.overallScore, level.parScore);
    const recommendation = generateRecommendation(results, level, rank);
    const primaryCause = !results.passed ? primaryFailureCause(results, level) : null;
    // Per-metric debrief: show the weak metrics (why + fix). On a fail we show the
    // full picture (up to 3); on a clear we surface at most one "push higher" note.
    const diagnostics = metricDiagnostics(results, level).slice(0, results.passed ? 1 : 3);
    // Full cause analysis: what each metric means and which choices produced it.
    const explanations = useMemo(() => analyzeMetricCauses(level, results.config, results), [level, results]);
    const causal = useMemo(() => summarizeRun(explanations, level), [explanations, level]);
    const explanationById = useMemo(() => {
        const map = new Map<MetricId, MetricExplanation>();
        for (const e of explanations) map.set(e.id, e);
        return map;
    }, [explanations]);
    const sortedImpacts = [...results.leverImpacts].sort((a, b) => b.impact - a.impact);
    const bestDecision = sortedImpacts[0];
    const worstDecision = sortedImpacts[sortedImpacts.length - 1];
    const badges = improvementBadges(improvements);
    const noNewRecords = improvements !== null && !improvements.anyImprovement;
    // The mission record already reflects this run (applied before the screen renders),
    // so the next goal points at the objective beyond what was just achieved.
    const goal = nextGoal(level, record);

    const badgeTone: Record<'gold' | 'cyan' | 'green', string> = {
        gold: 'border-amber-400/50 bg-amber-400/10 text-amber-300',
        cyan: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400',
        green: 'border-green-500/50 bg-green-500/10 text-green-400',
    };

    const getMetricStatus = (value: number, thresholds: { good: number; warn: number }): 'good' | 'warning' | 'danger' => {
        if (value >= thresholds.good) return 'good';
        if (value >= thresholds.warn) return 'warning';
        return 'danger';
    };

    const metrics: { id: MetricId; label: string; raw: number; format: (n: number) => string; displayMax?: number; pct: number; icon: IconName; status: 'good' | 'warning' | 'danger' }[] = [
        { id: 'fans', label: 'Fans Served', raw: results.realFansServed, format: n => n.toLocaleString(), displayMax: results.totalSeats, pct: results.fansServedPct, icon: 'Users', status: getMetricStatus(results.fansServedPct, { good: 50, warn: 25 }) },
        { id: 'bots', label: 'Bots Blocked', raw: results.botsBlockedPct, format: n => `${n}%`, pct: results.botsBlockedPct, icon: 'Shield', status: getMetricStatus(results.botsBlockedPct, { good: 70, warn: 50 }) },
        { id: 'checkout', label: 'Checkout Rate', raw: results.checkoutSuccessRate, format: n => `${n}%`, pct: results.checkoutSuccessRate, icon: 'Check', status: getMetricStatus(results.checkoutSuccessRate, { good: 70, warn: 50 }) },
        { id: 'satisfaction', label: 'Satisfaction', raw: results.satisfaction, format: n => `${n}`, pct: results.satisfaction, icon: 'Heart', status: getMetricStatus(results.satisfaction, { good: 65, warn: 45 }) },
        { id: 'stability', label: 'Stability', raw: results.siteStability, format: n => `${n}`, pct: results.siteStability, icon: 'Server', status: getMetricStatus(results.siteStability, { good: 60, warn: 40 }) },
        { id: 'fairness', label: 'Fairness', raw: results.fairness, format: n => `${n}`, pct: results.fairness, icon: 'Scale', status: getMetricStatus(results.fairness, { good: 70, warn: 50 }) },
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
                <div className={`panel mb-4 overflow-hidden ${rankBorder[rank.color]} ${rank.tier >= 3 ? 'animate-reward-glow' : ''}`} data-tour="results-score">
                    <div className={`p-4 md:p-5 ${rankBg[rank.color]}`}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 md:gap-4">
                                <span className="animate-medal inline-block"><MedalBadge rank={rank} size="md" /></span>
                                <div>
                                    <div className={`text-xs font-mono uppercase tracking-wider ${rankText[rank.color]}`}>
                                        {daily
                                            ? (results.passed ? 'Daily Challenge Cleared' : 'Daily Target Missed')
                                            : (results.passed ? 'Objective Achieved' : 'Mission Failed')}
                                    </div>
                                    <div className="text-3xl md:text-4xl font-bold text-white font-mono tabular-nums">
                                        <CountUpValue raw={results.overallScore} format={n => `${n}`} />
                                        <span className="text-lg md:text-xl text-slate-500"> / {level.parScore}</span>
                                    </div>
                                    {daily && (
                                        <div className="text-[11px] text-slate-400 mt-0.5">
                                            {daily.venueName} · {daily.dateKey}
                                        </div>
                                    )}
                                    {nextThreshold && (
                                        <div className="text-[11px] text-slate-400 mt-1">
                                            +{nextThreshold.needed} to <span className="font-mono font-bold text-cyan-400">{nextThreshold.label}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {!daily && results.passed && hasNextLevel && (
                                <div className="px-3 py-1.5 rounded border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 text-xs font-mono uppercase tracking-wider animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                                    Next Mission Unlocked
                                </div>
                            )}
                        </div>

                        {/* Record improvements — celebrate new bests, staggered pop-in */}
                        {badges.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {badges.map((b, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono font-bold uppercase tracking-wider animate-badge-pop ${badgeTone[b.tone]}`}
                                        style={{ animationDelay: `${400 + i * 120}ms` }}
                                    >
                                        <Icon name={b.icon} className="w-3.5 h-3.5" />
                                        <span>{b.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {noNewRecords && (
                            <div className="mt-3 text-xs text-slate-400">
                                No new records. Adjust your strategy and try again.
                            </div>
                        )}

                        {/* Daily Challenge chips: today's best, new-best celebration, streak */}
                        {daily && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {daily.newDailyBest && (
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono font-bold uppercase tracking-wider animate-badge-pop ${badgeTone.gold}`}>
                                        <Icon name="Star" className="w-3.5 h-3.5" />
                                        <span>New Daily Best</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-600 bg-slate-800/50 text-slate-300 text-[11px] font-mono uppercase tracking-wider">
                                    <Icon name="Target" className="w-3.5 h-3.5" />
                                    <span>Today's Best {daily.bestScoreToday}</span>
                                </div>
                                {daily.streak > 0 && (
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono font-bold uppercase tracking-wider ${badgeTone.cyan}`}>
                                        <Icon name="Zap" className="w-3.5 h-3.5" />
                                        <span>Streak {daily.streak}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-600 bg-slate-800/50 text-slate-400 text-[11px] font-mono uppercase tracking-wider">
                                    <Icon name="Refresh" className="w-3.5 h-3.5" />
                                    <span>Attempt {daily.attemptsToday}</span>
                                </div>
                            </div>
                        )}

                        {/* Next goal — campaign runs point past this run; daily points at today */}
                        <div className="mt-3 flex items-center gap-2 text-xs">
                            <Icon name="Target" className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Next Goal</span>
                            {daily ? (
                                <span className="font-semibold text-white">
                                    {daily.completedToday
                                        ? (results.overallScore >= daily.bestScoreToday ? 'Cleared — push today\'s best higher.' : `Beat today's best of ${daily.bestScoreToday}.`)
                                        : `Reach ${level.parScore} to clear today's challenge.`}
                                </span>
                            ) : (
                                <>
                                    <span className="font-semibold text-white">{goal.label}</span>
                                    <span className="text-slate-500 hidden sm:inline">— {goal.detail}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {showDetails && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4" data-tour="results-metrics">
                            {metrics.map((m, i) => {
                                const colors = { good: { text: 'text-green-400', bar: 'bg-green-500' }, warning: { text: 'text-amber-400', bar: 'bg-amber-500' }, danger: { text: 'text-red-400', bar: 'bg-red-500' } }[m.status];
                                const open = openMetric === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => setOpenMetric(open ? null : m.id)}
                                        aria-expanded={open}
                                        aria-controls="qq-metric-detail"
                                        className={`panel qq-press p-3 text-left animate-count-rise cursor-pointer border ${open ? 'border-cyan-400 glow-cyan' : 'hover:border-cyan-500/50'}`}
                                        style={{ animationDelay: `${i * 60}ms` }}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400">{m.label}</span>
                                            <span className={colors.text}><Icon name={m.icon} className="w-3.5 h-3.5" /></span>
                                        </div>
                                        <div className={`text-xl md:text-2xl font-bold ${colors.text} font-mono tabular-nums truncate`}>
                                            <CountUpValue raw={m.raw} format={m.format} delayMs={i * 60} />
                                            {m.displayMax && <span className="text-xs text-slate-500"> / {m.displayMax.toLocaleString()}</span>}
                                        </div>
                                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                                            <div className={`h-full ${colors.bar} transition-all duration-700`} style={{ width: `${m.pct}%`, transitionDelay: `${i * 60}ms` }} />
                                        </div>
                                        <div className={`mt-1.5 text-[10px] flex items-center gap-1 ${open ? 'text-cyan-400' : 'text-slate-500'}`}>
                                            <span aria-hidden>{open ? '▾' : '▸'}</span>
                                            <span>{open ? 'Hide explanation' : 'Why this score?'}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* How your choices affected this run — causal summary + per-metric detail */}
                        <div className="panel mb-4" data-tour="results-causes">
                            <div className="panel-header">
                                <span className="text-xs uppercase tracking-wider font-semibold">How Your Choices Affected This Run</span>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="grid md:grid-cols-3 gap-2 text-xs">
                                    <div className="p-2.5 rounded border border-green-500/30 bg-green-500/5">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-green-400 mb-0.5">Biggest Help</div>
                                        <div className="text-white font-semibold">{causal.topPositive.factor.label}</div>
                                        <div className="text-slate-400 mt-0.5">→ {causal.topPositive.metric}</div>
                                    </div>
                                    <div className="p-2.5 rounded border border-amber-500/30 bg-amber-500/5">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-0.5">Biggest Drag</div>
                                        {causal.topNegative ? (
                                            <>
                                                <div className="text-white font-semibold">{causal.topNegative.factor.label}</div>
                                                <div className="text-slate-400 mt-0.5">→ {causal.topNegative.metric}</div>
                                            </>
                                        ) : (
                                            <div className="text-slate-400">Nothing stood out — a balanced run.</div>
                                        )}
                                    </div>
                                    <div className="p-2.5 rounded border border-cyan-500/30 bg-cyan-500/5">
                                        <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 mb-0.5">Highest-Impact Change</div>
                                        <div className="text-white">{causal.recommendation}</div>
                                    </div>
                                </div>

                                <p className="text-[11px] text-slate-500">
                                    Tap any metric card above to see what it means and exactly which choices moved it.
                                </p>

                                {openMetric && explanationById.get(openMetric) && (() => {
                                    const e = explanationById.get(openMetric)!;
                                    const toneText = { good: 'text-green-400', warning: 'text-amber-400', danger: 'text-red-400' }[e.tone];
                                    return (
                                        <div id="qq-metric-detail" className="rounded border border-cyan-500/30 bg-slate-900/40 overflow-hidden">
                                            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
                                                <span className="text-xs font-mono uppercase tracking-wider text-cyan-300 font-bold">{e.label} — {e.display}</span>
                                                <span className={`text-[10px] font-mono uppercase ${toneText}`}>{e.tone === 'good' ? 'Healthy' : e.tone === 'warning' ? 'Strained' : 'Critical'}</span>
                                            </div>
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-0.5">What it means</div>
                                                    <p className="text-slate-200">{e.definition}</p>
                                                </div>
                                                {e.positiveFactors.length > 0 && (
                                                    <div>
                                                        <div className="text-[10px] font-mono uppercase tracking-wider text-green-400 mb-1">What helped</div>
                                                        <ul className="space-y-1">
                                                            {e.positiveFactors.map((f, i) => (
                                                                <li key={i} className="flex items-start gap-1.5">
                                                                    <span className="text-green-400 shrink-0 mt-0.5"><Icon name="Check" className="w-3 h-3" /></span>
                                                                    <span className="text-slate-300"><span className="text-white font-semibold">{f.label}.</span> {f.detail}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {e.negativeFactors.length > 0 && (
                                                    <div>
                                                        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-1">What reduced the score</div>
                                                        <ul className="space-y-1">
                                                            {e.negativeFactors.map((f, i) => (
                                                                <li key={i} className="flex items-start gap-1.5">
                                                                    <span className="text-amber-400 shrink-0 mt-0.5"><Icon name="X" className="w-3 h-3" /></span>
                                                                    <span className="text-slate-300"><span className="text-white font-semibold">{f.label}.</span> {f.detail}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                <div className="flex items-start gap-1.5 pt-1 border-t border-slate-800">
                                                    <span className="text-cyan-400 shrink-0 mt-0.5"><Icon name="Target" className="w-3 h-3" /></span>
                                                    <span><span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">Try next </span><span className="text-cyan-200">{e.recommendation}</span></span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Level-specific scenario debrief line */}
                        <div className={`panel mb-4 p-4 border-l-2 ${results.passed ? 'border-l-green-500' : 'border-l-red-500'}`}>
                            <div className="flex items-start gap-3">
                                <span className={`shrink-0 mt-0.5 ${results.passed ? 'text-green-400' : 'text-red-400'}`}>
                                    <Icon name={level.icon} className="w-4 h-4" />
                                </span>
                                <div>
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-0.5">{level.name} — Debrief</div>
                                    <p className="text-sm text-white">{scenarioSummary(level, results)}</p>
                                </div>
                            </div>
                        </div>

                        {results.trace.length > 0 && (
                            <div className="panel mb-4" data-tour="results-trace">
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

                        <div className="panel mb-4" data-tour="results-debrief">
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

                                {/* Per-metric debrief — every weak metric: what happened + the fix */}
                                {diagnostics.length > 0 && (
                                    <div className="rounded border border-slate-700 bg-slate-900/40 overflow-hidden">
                                        <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                                            {results.passed ? 'Room to Improve' : 'What Held You Back'}
                                        </div>
                                        <div className="divide-y divide-slate-800">
                                            {diagnostics.map((d, i) => (
                                                <div key={i} className="p-3 flex items-start gap-3">
                                                    <span className={`shrink-0 mt-0.5 ${d.severity === 'danger' ? 'text-red-400' : 'text-amber-400'}`}>
                                                        <Icon name={d.severity === 'danger' ? 'Alert' : 'Activity'} className="w-4 h-4" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className={`text-sm font-semibold ${d.severity === 'danger' ? 'text-red-300' : 'text-amber-300'}`}>{d.label}</div>
                                                        <p className="text-xs text-slate-300 mt-0.5">{d.why}</p>
                                                        <p className="text-xs mt-1 flex items-start gap-1.5">
                                                            <span className="text-cyan-400 shrink-0"><Icon name="ArrowRight" className="w-3 h-3" /></span>
                                                            <span className="text-cyan-300">{d.fix}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
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

                <div className="grid grid-cols-2 md:flex md:flex-wrap md:justify-center gap-2 md:gap-3 animate-fade-in-up" style={{ animationDelay: '250ms' }} data-tour="results-actions">
                    <button onClick={onAdjust} className="qq-press flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded font-semibold text-sm transition-all">
                        <Icon name="Activity" className="w-4 h-4" /><span>Adjust Setup</span>
                    </button>
                    <button onClick={onResetTry} className="qq-press flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-sm transition-all border border-slate-700">
                        <Icon name="Refresh" className="w-4 h-4" /><span>Reset Setup</span>
                    </button>
                    <button onClick={onLevelSelect} className="qq-press flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-sm transition-all border border-slate-700">
                        <Icon name="Layers" className="w-4 h-4" /><span>Mission Board</span>
                    </button>
                    {daily ? (
                        <button
                            onClick={daily.onReplayToday}
                            className="qq-press col-span-2 md:col-span-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-400 hover:bg-amber-300 font-bold text-sm rounded transition-all glow-gold"
                            style={{ color: '#0a0e14' }}
                        >
                            <Icon name="Refresh" className="w-4 h-4" />
                            <span>Replay Today's Challenge</span>
                        </button>
                    ) : campaignComplete ? (
                        <button
                            onClick={onViewCampaign}
                            className="qq-press col-span-2 md:col-span-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-400 hover:bg-amber-300 font-bold text-sm rounded transition-all glow-gold animate-reward-glow"
                            style={{ color: '#0a0e14' }}
                        >
                            <Icon name="Trophy" className="w-4 h-4" />
                            <span>Campaign Complete</span>
                        </button>
                    ) : results.passed && hasNextLevel && (
                        <button
                            onClick={onNextLevel}
                            className="qq-press col-span-2 md:col-span-1 flex items-center justify-center gap-2 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 font-bold text-sm rounded transition-all glow-cyan"
                            style={{ color: '#0a0e14' }}
                        >
                            <span>Next Mission</span>
                            <Icon name="ArrowRight" className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            <ScreenTour tourId="results" steps={RESULTS_TOUR} autoDelayMs={1500} />
        </div>
    );
}
