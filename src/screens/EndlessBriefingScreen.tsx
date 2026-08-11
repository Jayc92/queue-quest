import type { EndlessRecord } from '../game/types';
import { formatDuration } from '../game/format';
import { Icon } from '../components/ui/Icon';
import { ScreenTour } from '../components/tour/ScreenTour';
import { ENDLESS_TOUR } from '../data/tours';

interface Props {
    endless?: EndlessRecord;
    onStart: () => void;
    onBack: () => void;
}

// M:SS shift-time formatter (shared helper).
const fmtTime = formatDuration;

export function EndlessBriefingScreen({ endless, onStart, onBack }: Props) {
    const records: { label: string; value: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
        { label: 'Longest Shift', value: endless ? fmtTime(endless.longestShift) : '—', icon: 'Clock' },
        { label: 'Highest Score', value: endless ? endless.highestScore.toLocaleString() : '—', icon: 'Star' },
        { label: 'Highest Combo', value: endless ? `${endless.highestCombo}` : '—', icon: 'Zap' },
        { label: 'Most Fans', value: endless ? endless.mostFansServed.toLocaleString() : '—', icon: 'Users' },
    ];

    return (
        <div className="min-h-screen grid-bg p-3 md:p-6">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={onBack} className="qq-press flex items-center gap-2 text-slate-400 hover:text-white py-2 px-1">
                        <Icon name="ArrowLeft" className="w-5 h-5" />
                        <span className="text-sm">Back</span>
                    </button>
                    <div className="px-3 py-1 rounded border border-amber-400/40 bg-amber-400/10 text-amber-300 text-[10px] font-mono uppercase tracking-wider">
                        Endless Shift
                    </div>
                </div>

                <div className="panel overflow-hidden border-amber-400/30">
                    <div className="p-5 border-b border-slate-800" data-tour="endless-header" style={{ background: 'linear-gradient(90deg, rgba(251,191,36,0.1) 0%, transparent 100%)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-lg bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                                <Icon name="Activity" className="w-7 h-7" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-mono text-slate-500 mb-0.5">OPEN-ENDED OPERATION</div>
                                <h2 className="text-xl md:text-2xl font-bold text-white">Endless Shift</h2>
                                <p className="text-xs md:text-sm text-slate-400">Survive escalating pressure for as long as you can.</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 md:p-5 space-y-4">
                        <div>
                            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">Situation</h3>
                            <p className="text-sm text-slate-300 leading-relaxed">
                                A quiet venue opens. It won't stay quiet. Demand climbs, bots evolve, servers strain, and
                                incidents strike in waves. Adjust your levers live to hold the line. There is no finish —
                                only how long you last.
                            </p>
                        </div>

                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50" data-tour="endless-ends">
                            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">How a shift ends</div>
                            <ul className="space-y-1 text-xs text-slate-300">
                                <li className="flex items-center gap-2"><span className="text-red-400"><Icon name="Server" className="w-3.5 h-3.5" /></span>Stability collapses</li>
                                <li className="flex items-center gap-2"><span className="text-red-400"><Icon name="Scale" className="w-3.5 h-3.5" /></span>Fairness collapses</li>
                                <li className="flex items-center gap-2"><span className="text-red-400"><Icon name="Users" className="w-3.5 h-3.5" /></span>Fans abandon the queue</li>
                            </ul>
                        </div>

                        {/* Personal records */}
                        <div data-tour="endless-records">
                            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Your Records</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {records.map((r, i) => (
                                    <div key={i} className="panel p-2.5 text-center">
                                        <span className="text-amber-300 mx-auto mb-1 block"><Icon name={r.icon} className="w-3.5 h-3.5" /></span>
                                        <div className="text-base font-mono font-bold text-white tabular-nums leading-none">{r.value}</div>
                                        <div className="text-[9px] font-mono uppercase tracking-wide text-slate-500 mt-1">{r.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={onStart}
                            data-tour="endless-begin"
                            className="qq-press w-full flex items-center justify-center gap-2 px-4 py-4 bg-amber-400 hover:bg-amber-300 font-bold rounded transition-all glow-gold"
                            style={{ color: '#0a0e14' }}
                        >
                            <Icon name="Play" className="w-5 h-5" fill="currentColor" />
                            <span>Begin Shift</span>
                        </button>
                    </div>
                </div>
            </div>

            <ScreenTour tourId="endless" steps={ENDLESS_TOUR} />
        </div>
    );
}
