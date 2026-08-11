import type { EndlessRunResult, EndlessRecord, EndlessImprovements, EndlessEndReason } from '../game/types';
import { formatDuration } from '../game/format';
import { Icon } from '../components/ui/Icon';
import { useCountUp } from '../components/ui/useCountUp';

interface Props {
    result: EndlessRunResult;
    record?: EndlessRecord;         // record AFTER this run is applied (bests reflect the run)
    improvements: EndlessImprovements | null;
    onRetry: () => void;
    onExit: () => void;
}

// M:SS shift-time formatter (shared helper).
const fmtTime = formatDuration;

const END_REASON_TEXT: Record<EndlessEndReason, { label: string; detail: string }> = {
    stability: { label: 'Server Collapse', detail: 'Stability hit zero — the platform went down under load.' },
    fairness: { label: 'Fairness Collapse', detail: 'Fairness hit zero — the queue stopped being equitable.' },
    patience: { label: 'Fans Abandoned', detail: 'Fan patience ran out — the crowd walked away.' },
};

function CountUp({ raw, format, delayMs = 0 }: { raw: number; format: (n: number) => string; delayMs?: number }) {
    const n = useCountUp(raw, 800, delayMs);
    return <>{format(n)}</>;
}

// Next goal from the current bests — always actionable.
function nextEndlessGoal(record?: EndlessRecord): string {
    if (!record) return 'Survive your first shift and set a baseline.';
    if (record.longestShift < 60) return 'Survive a full minute — hold your meters through Wave 2.';
    if (record.highestCombo < 15) return 'Chain a 15+ combo by keeping every meter healthy at once.';
    if (record.longestShift < 180) return 'Reach the 3-minute mark — adapt faster to incidents.';
    return `Beat your best score of ${record.highestScore.toLocaleString()}.`;
}

export function EndlessReportScreen({ result, record, improvements, onRetry, onExit }: Props) {
    const reason = END_REASON_TEXT[result.endReason];

    const brokenRecords: string[] = [];
    if (improvements?.newLongestShift) brokenRecords.push('LONGEST SHIFT');
    if (improvements?.newHighestScore) brokenRecords.push('HIGHEST SCORE');
    if (improvements?.newHighestCombo) brokenRecords.push('HIGHEST COMBO');
    if (improvements?.newMostFansServed) brokenRecords.push('MOST FANS SERVED');

    const stats: { label: string; raw: number; format: (n: number) => string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
        { label: 'Time Survived', raw: result.timeSurvived, format: fmtTime, icon: 'Clock' },
        { label: 'Waves Reached', raw: result.wavesReached, format: n => `${n}`, icon: 'Layers' },
        { label: 'Operator Score', raw: result.operatorScore, format: n => n.toLocaleString(), icon: 'Star' },
        { label: 'Highest Combo', raw: result.highestCombo, format: n => `x${n}`, icon: 'Zap' },
        { label: 'Fans Served', raw: result.fansServed, format: n => n.toLocaleString(), icon: 'Users' },
        { label: 'Bots Blocked', raw: result.botsBlocked, format: n => n.toLocaleString(), icon: 'Shield' },
    ];

    return (
        <div className="min-h-screen grid-bg p-3 md:p-6">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="panel mb-4 overflow-hidden border-amber-400/40">
                    <div className="p-4 md:p-5 bg-amber-400/10">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 md:gap-4">
                                <div className="w-16 h-16 rounded-full border-2 border-amber-300 bg-amber-400/20 flex items-center justify-center text-amber-300 animate-medal shrink-0">
                                    <Icon name="Activity" className="w-8 h-8" />
                                </div>
                                <div>
                                    <div className="text-xs font-mono uppercase tracking-wider text-amber-300">Shift Report</div>
                                    <div className="text-3xl md:text-4xl font-bold text-white font-mono tabular-nums">
                                        <CountUp raw={result.timeSurvived} format={fmtTime} />
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-1">
                                        Ended: <span className="font-semibold text-red-300">{reason.label}</span>
                                    </div>
                                </div>
                            </div>
                            {brokenRecords.length > 0 && (
                                <div className="px-3 py-1.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-300 text-xs font-mono uppercase tracking-wider animate-reward-glow">
                                    {brokenRecords.length} record{brokenRecords.length > 1 ? 's' : ''} broken
                                </div>
                            )}
                        </div>

                        {brokenRecords.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {brokenRecords.map((r, i) => (
                                    <div key={i} className="animate-badge-pop flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-400/50 bg-amber-400/10 text-amber-300 text-[11px] font-mono font-bold uppercase tracking-wider"
                                        style={{ animationDelay: `${200 + i * 120}ms` }}>
                                        <Icon name="Star" className="w-3.5 h-3.5" />
                                        <span>NEW {r}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {improvements && !improvements.anyImprovement && (
                            <div className="mt-3 text-xs text-slate-400">No records broken this shift. The pressure caught up — adapt faster next time.</div>
                        )}
                    </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                    {stats.map((s, i) => (
                        <div key={i} className="panel p-3 animate-count-rise" style={{ animationDelay: `${i * 60}ms` }}>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] uppercase tracking-wider text-slate-400">{s.label}</span>
                                <span className="text-cyan-400"><Icon name={s.icon} className="w-3.5 h-3.5" /></span>
                            </div>
                            <div className="text-xl md:text-2xl font-bold text-white font-mono tabular-nums truncate">
                                <CountUp raw={s.raw} format={s.format} delayMs={i * 60} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* End reason detail */}
                <div className="panel p-4 mb-4 border-l-2 border-l-red-500">
                    <div className="flex items-start gap-3">
                        <span className="text-red-400 shrink-0 mt-0.5"><Icon name="Alert" className="w-4 h-4" /></span>
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-wider text-red-400 mb-0.5">How the shift ended</div>
                            <p className="text-sm text-white">{reason.detail}</p>
                        </div>
                    </div>
                </div>

                {/* Operational decisions summary */}
                <DecisionsSummary result={result} />

                {/* Personal best + next goal */}
                {record && (
                    <div className="panel p-4 mb-4">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Personal Best</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <PB label="Longest" value={fmtTime(record.longestShift)} />
                            <PB label="Score" value={record.highestScore.toLocaleString()} />
                            <PB label="Combo" value={`x${record.highestCombo}`} />
                            <PB label="Fans" value={record.mostFansServed.toLocaleString()} />
                        </div>
                    </div>
                )}

                <div className="panel p-4 mb-4 border-l-2 border-l-cyan-500">
                    <div className="flex items-start gap-3">
                        <span className="text-cyan-400 shrink-0 mt-0.5"><Icon name="Target" className="w-4 h-4" /></span>
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 mb-0.5">Next Goal</div>
                            <p className="text-sm text-white">{nextEndlessGoal(record)}</p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 md:gap-3 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
                    <button onClick={onRetry}
                        className="qq-press flex items-center justify-center gap-2 px-4 py-3 bg-amber-400 hover:bg-amber-300 font-bold text-sm rounded transition-all glow-gold"
                        style={{ color: '#0a0e14' }}>
                        <Icon name="Refresh" className="w-4 h-4" />
                        <span>New Shift</span>
                    </button>
                    <button onClick={onExit}
                        className="qq-press flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-sm transition-all border border-slate-700">
                        <Icon name="Layers" className="w-4 h-4" />
                        <span>Mission Board</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

function PB({ label, value }: { label: string; value: string }) {
    return (
        <div className="text-center">
            <div className="text-base font-mono font-bold text-white tabular-nums leading-none">{value}</div>
            <div className="text-[9px] font-mono uppercase tracking-wide text-slate-500 mt-1">{label}</div>
        </div>
    );
}

const DECISION_KIND_STYLE: Record<'correct' | 'wrong' | 'ignored', { icon: Parameters<typeof Icon>[0]['name']; color: string }> = {
    correct: { icon: 'Check', color: 'text-green-400' },
    wrong: { icon: 'X', color: 'text-red-400' },
    ignored: { icon: 'Clock', color: 'text-slate-500' },
};

// Shift-report block: the four decision records plus the ordered list of
// "Major Decisions Taken" (ignored calls are shown too, so the log is complete).
function DecisionsSummary({ result }: { result: EndlessRunResult }) {
    const answered = result.decisionsCorrect + result.decisionsWrong;
    const total = answered + result.decisionsIgnored;
    const accuracy = answered > 0 ? Math.round((result.decisionsCorrect / answered) * 100) : null;

    // Nothing to show if no decisions were ever offered (very short shift).
    if (total === 0) {
        return (
            <div className="panel p-4 mb-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Operational Decisions</div>
                <p className="text-xs text-slate-400">No operations decisions reached you this shift — survive longer to face live judgment calls.</p>
            </div>
        );
    }

    return (
        <div className="panel p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Operational Decisions</div>
                {accuracy !== null && (
                    <div className="text-[11px] font-mono">
                        <span className="text-slate-400">Accuracy </span>
                        <span className={`font-bold ${accuracy >= 66 ? 'text-green-400' : accuracy >= 33 ? 'text-amber-400' : 'text-red-400'}`}>{accuracy}%</span>
                    </div>
                )}
            </div>

            {/* Record row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <DecisionStat label="Correct" value={result.decisionsCorrect} color="text-green-400" icon="Check" />
                <DecisionStat label="Wrong" value={result.decisionsWrong} color="text-red-400" icon="X" />
                <DecisionStat label="Ignored" value={result.decisionsIgnored} color="text-slate-400" icon="Clock" />
                <DecisionStat label="Best Streak" value={result.longestCorrectStreak} color="text-cyan-400" icon="Zap" />
            </div>

            {/* Major decisions taken — chronological log */}
            <div className="border-t border-slate-800 pt-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Major Decisions Taken</div>
                {result.history.length === 0 ? (
                    <p className="text-xs text-slate-400">No decisions were acted on.</p>
                ) : (
                    <ul className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                        {result.history.map((h, i) => {
                            const s = DECISION_KIND_STYLE[h.kind];
                            return (
                                <li key={i} className="flex items-center gap-2 text-xs">
                                    <span className={`shrink-0 ${s.color}`}><Icon name={s.icon} className="w-3.5 h-3.5" /></span>
                                    <span className="font-mono text-slate-500 tabular-nums shrink-0">{fmtTime(h.tick)}</span>
                                    <span className={`truncate ${h.kind === 'ignored' ? 'text-slate-400 italic' : 'text-white'}`}>{h.historyLabel}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

function DecisionStat({ label, value, color, icon }: { label: string; value: number; color: string; icon: Parameters<typeof Icon>[0]['name'] }) {
    return (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className={color}><Icon name={icon} className="w-3 h-3" /></span>
                <span className={`text-lg font-mono font-bold tabular-nums ${color}`}>{value}</span>
            </div>
            <div className="text-[9px] font-mono uppercase tracking-wide text-slate-500">{label}</div>
        </div>
    );
}
