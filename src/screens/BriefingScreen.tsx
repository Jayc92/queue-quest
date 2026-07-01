import type { Level } from '../game/types';
import { Icon } from '../components/ui/Icon';

interface Props {
    level: Level;
    onContinue: () => void;
    onBack: () => void;
}

export function BriefingScreen({ level, onContinue, onBack }: Props) {
    const demandRatio = Math.round(level.demand / level.seats);

    return (
        <div className="min-h-screen grid-bg p-3 md:p-6">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white py-2 px-1">
                        <Icon name="ArrowLeft" className="w-5 h-5" />
                        <span className="text-sm">Back</span>
                    </button>
                    <div className="px-3 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-mono uppercase tracking-wider">Briefing</div>
                </div>

                <div className="panel overflow-hidden">
                    <div className="p-5 border-b border-slate-800" style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.1) 0%, transparent 100%)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                                <Icon name={level.icon} className="w-7 h-7" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-mono text-slate-500 mb-0.5">OPERATION {level.id}</div>
                                <h2 className="text-xl md:text-2xl font-bold text-white truncate">{level.name}</h2>
                                <p className="text-xs md:text-sm text-slate-400">{level.subtitle}</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 md:p-5 space-y-4">
                        <div>
                            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">Scenario</h3>
                            <p className="text-sm text-slate-300 leading-relaxed">{level.description}</p>
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

                        <div className="grid grid-cols-3 gap-2">
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

                        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
                            <div className="flex items-start gap-2">
                                <span className="text-amber-400 shrink-0 mt-0.5"><Icon name="Alert" className="w-4 h-4" /></span>
                                <div>
                                    <div className="text-[10px] font-mono text-amber-400 mb-0.5 uppercase tracking-wider">Operational Constraint</div>
                                    <p className="text-xs text-amber-200">{level.constraint}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-cyan-400"><Icon name="Target" className="w-5 h-5" /></span>
                                <div>
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Target Score</div>
                                    <div className="text-2xl font-mono font-bold text-cyan-400">{level.parScore}</div>
                                </div>
                            </div>
                            <button
                                onClick={onContinue}
                                className="flex items-center gap-2 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 font-bold text-sm rounded transition-all"
                                style={{ color: '#0a0e14' }}
                            >
                                <span>Configure</span>
                                <Icon name="ArrowRight" className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
