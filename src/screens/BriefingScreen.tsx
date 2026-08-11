import type { Level, ThreatLevel } from '../game/types';
import { Icon } from '../components/ui/Icon';
import { ScreenTour } from '../components/tour/ScreenTour';
import { BRIEFING_TOUR, DAILY_TOUR } from '../data/tours';

interface Props {
    level: Level;
    /** Set when this briefing is today's Daily Challenge (value = local date key). */
    dailyDateKey?: string;
    onContinue: () => void;
    onBack: () => void;
}

function threatChip(threat: ThreatLevel): string {
    switch (threat) {
        case 'Low': return 'border-green-500/40 bg-green-500/10 text-green-400';
        case 'Moderate': return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400';
        case 'High': return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
        case 'Severe': return 'border-red-500/40 bg-red-500/10 text-red-400';
        case 'Critical': return 'border-red-500/50 bg-red-500/20 text-red-300';
    }
}

function BriefRow({ label, text, accent }: { label: string; text: string; accent?: boolean }) {
    return (
        <div>
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">{label}</h3>
            <p className={`text-sm leading-relaxed ${accent ? 'text-cyan-100' : 'text-slate-300'}`}>{text}</p>
        </div>
    );
}

export function BriefingScreen({ level, dailyDateKey, onContinue, onBack }: Props) {
    const demandRatio = Math.round(level.demand / level.seats);
    const identity = level.identity;
    const isDaily = dailyDateKey !== undefined;

    return (
        <div className="min-h-screen grid-bg p-3 md:p-6">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white py-2 px-1">
                        <Icon name="ArrowLeft" className="w-5 h-5" />
                        <span className="text-sm">Back</span>
                    </button>
                    <div className={`px-3 py-1 rounded border text-[10px] font-mono uppercase tracking-wider ${isDaily ? 'border-amber-400/50 bg-amber-400/10 text-amber-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
                        {isDaily ? `Daily Challenge · ${dailyDateKey}` : 'Briefing'}
                    </div>
                </div>

                <div className="panel overflow-hidden">
                    <div className="p-5 border-b border-slate-800" style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.1) 0%, transparent 100%)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                                <Icon name={level.icon} className="w-7 h-7" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-mono text-slate-500 mb-0.5">{isDaily ? 'TODAY’S ONSALE' : `OPERATION ${level.id}`}</div>
                                <h2 className="text-xl md:text-2xl font-bold text-white truncate">{level.name}</h2>
                                <p className="text-xs md:text-sm text-slate-400">{level.subtitle}</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 md:p-5 space-y-4">
                        {/* Mission identity chips */}
                        <div className="flex flex-wrap gap-2">
                            <div className={`px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-wider ${threatChip(identity.threatLevel)}`}>
                                Threat: {identity.threatLevel}
                            </div>
                            <div className="px-2 py-1 rounded border border-slate-700 bg-slate-800/50 text-slate-300 text-[10px] font-mono uppercase tracking-wider">
                                {identity.missionType}
                            </div>
                            <div className="px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-[10px] font-mono uppercase tracking-wider">
                                Focus: {identity.primaryConcern}
                            </div>
                        </div>

                        {/* Structured operations briefing */}
                        <div className="space-y-3" data-tour="brief-story">
                            <BriefRow label="Situation" text={identity.briefing.situation} />
                            <BriefRow label="Threat Assessment" text={identity.briefing.threatAssessment} />
                            <BriefRow label="Operational Goal" text={identity.briefing.operationalGoal} accent />
                        </div>

                        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Demand vs Inventory</span>
                                <span className="text-xs font-mono text-red-400 font-bold">{demandRatio}:1</span>
                            </div>
                            <div className="h-3 bg-slate-800 rounded overflow-hidden relative">
                                <div className="absolute inset-0 bg-cyan-500" style={{ width: `${Math.max(3, Math.min(100, (level.seats / level.demand) * 100 * 5))}%`, top: 0, bottom: 0 }} />
                            </div>
                            <div className="flex justify-between mt-1.5 text-xs">
                                <span className="text-cyan-400 font-mono">{level.seats.toLocaleString()} seats</span>
                                <span className="text-red-400 font-mono">{level.demand.toLocaleString()} demand</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2" data-tour="brief-stats">
                            <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 text-center">
                                <span className="text-slate-500 mx-auto mb-1 block"><Icon name="Bot" className="w-4 h-4" /></span>
                                <div className={`text-lg font-mono font-bold ${level.botPressure > 0.5 ? 'text-red-400' : 'text-amber-400'}`}>
                                    {Math.round(level.botPressure * 100)}%
                                </div>
                                <div className="text-[10px] text-slate-500">Bot Threat</div>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 text-center">
                                <span className="text-slate-500 mx-auto mb-1 block"><Icon name="Dollar" className="w-4 h-4" /></span>
                                <div className={`text-lg font-mono font-bold ${level.resalePressure > 0.7 ? 'text-red-400' : 'text-amber-400'}`}>
                                    {Math.round(level.resalePressure * 100)}%
                                </div>
                                <div className="text-[10px] text-slate-500">Resale Risk</div>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 text-center">
                                <span className="text-slate-500 mx-auto mb-1 block"><Icon name="Server" className="w-4 h-4" /></span>
                                <div className={`text-lg font-mono font-bold ${level.serverRisk > 0.6 ? 'text-red-400' : 'text-amber-400'}`}>
                                    {Math.round(level.serverRisk * 100)}%
                                </div>
                                <div className="text-[10px] text-slate-500">Server Risk</div>
                            </div>
                        </div>

                        {/* Known risks */}
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50" data-tour="brief-risks">
                            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">Known Risks</div>
                            <ul className="space-y-1">
                                {identity.briefing.knownRisks.map((risk, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                                        <span className="text-amber-400 shrink-0 mt-0.5"><Icon name="Alert" className="w-3 h-3" /></span>
                                        <span>{risk}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Scenario event — the deterministic pre-launch modifier */}
                        <div className={`p-3 rounded-lg border ${identity.scenario.severity === 'danger' ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`} data-tour="brief-scenario">
                            <div className="flex items-start gap-2">
                                <span className={`shrink-0 mt-0.5 ${identity.scenario.severity === 'danger' ? 'text-red-400 animate-blink' : 'text-amber-400'}`}>
                                    <Icon name="Alert" className="w-4 h-4" />
                                </span>
                                <div>
                                    <div className={`text-[10px] font-mono mb-0.5 uppercase tracking-wider ${identity.scenario.severity === 'danger' ? 'text-red-400' : 'text-amber-400'}`}>
                                        Scenario Event · {identity.scenario.label}
                                    </div>
                                    <p className={`text-xs ${identity.scenario.severity === 'danger' ? 'text-red-200' : 'text-amber-200'}`}>{identity.scenario.detail}</p>
                                </div>
                            </div>
                        </div>

                        {/* Success criteria */}
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50" data-tour="brief-success">
                            <div className="flex items-start gap-2">
                                <span className="text-green-400 shrink-0 mt-0.5"><Icon name="Check" className="w-4 h-4" /></span>
                                <div>
                                    <div className="text-[10px] font-mono text-slate-500 mb-0.5 uppercase tracking-wider">Success Criteria</div>
                                    <p className="text-xs text-slate-300">{identity.briefing.successCriteria}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 gap-3" data-tour="brief-target">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-cyan-400"><Icon name="Target" className="w-5 h-5" /></span>
                                <div>
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Target Score</div>
                                    <div className="text-2xl font-mono font-bold text-cyan-400">{level.parScore}</div>
                                </div>
                            </div>
                            <button
                                onClick={onContinue}
                                className="qq-press flex items-center gap-2 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 font-bold text-sm rounded transition-all"
                                style={{ color: '#0a0e14' }}
                            >
                                <span>Configure</span>
                                <Icon name="ArrowRight" className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Campaign briefings get the full interface tour; the first Daily
                briefing gets a single centered step explaining the daily cadence. */}
            {isDaily
                ? <ScreenTour tourId="daily" steps={DAILY_TOUR} hideHelp />
                : <ScreenTour tourId="briefing" steps={BRIEFING_TOUR} />}
        </div>
    );
}
