import type { Level, GameConfig, ProjectionResult } from '../../game/types';
import { Icon } from '../ui/Icon';

interface Props {
    level: Level;
    config: GameConfig;
    projections: ProjectionResult;
}

export function QueueTraffic({ config, projections, level }: Props) {
    const waves = Math.min(config.waveCount, 5);
    const publicPct = projections.publicPercent;
    const botExposure = projections.botExposure;
    const loadRisk = projections.loadRisk;

    const lanes = Array.from({ length: waves }).map((_, i) => {
        const packetsPerLane = 4 + Math.round((level.demand / level.seats) / 3);
        return { id: i, packets: Math.min(8, packetsPerLane) };
    });

    const serverTone: 'red' | 'amber' | 'green' = loadRisk > 65 ? 'red' : loadRisk > 35 ? 'amber' : 'green';
    const serverColorMap = {
        red: 'border-red-500 bg-red-500/20 text-red-400',
        amber: 'border-amber-500 bg-amber-500/20 text-amber-400',
        green: 'border-green-500 bg-green-500/20 text-green-400',
    } as const;

    return (
        <div className="panel p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Queue Traffic Simulation</span>
                <span className={`text-[10px] font-mono ${serverTone === 'red' ? 'text-red-400 animate-blink' : serverTone === 'amber' ? 'text-amber-400' : 'text-green-400'}`}>LIVE</span>
            </div>
            <div className="relative flex items-stretch gap-3">
                <div className="shrink-0 flex flex-col justify-center items-center w-14">
                    <div className="w-10 h-10 rounded border-2 border-cyan-500/50 bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                        <Icon name="Users" className="w-4 h-4" />
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 mt-1">QUEUE</div>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-1.5 min-h-[80px] py-2 relative overflow-hidden">
                    {lanes.map((lane, li) => (
                        <div key={li} className="relative h-4 rounded bg-slate-900/60 border border-slate-800 overflow-hidden">
                            {Array.from({ length: lane.packets }).map((_, pi) => {
                                const isBot = (pi * 37 + li * 13) % 100 < botExposure;
                                const dotColor = isBot ? 'bg-red-500' : 'bg-cyan-400';
                                const shadowColor = isBot ? '0 0 6px rgba(239,68,68,0.7)' : '0 0 6px rgba(34,211,238,0.7)';
                                const delay = (pi * 0.35 + li * 0.15) % 3;
                                return (
                                    <span
                                        key={pi}
                                        className={`absolute top-1/2 -translate-y-1/2 left-0 w-1.5 h-1.5 rounded-sm ${dotColor} animate-queue-flow`}
                                        style={{
                                            animationDelay: `${delay}s`,
                                            animationDuration: `${2.5 + li * 0.2}s`,
                                            boxShadow: shadowColor,
                                        }}
                                    />
                                );
                            })}
                        </div>
                    ))}
                    {waves === 1 && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <span className="text-[9px] font-mono text-amber-400 uppercase bg-terminal-bg/70 px-1.5 py-0.5 rounded">
                                Single lane · load risk
                            </span>
                        </div>
                    )}
                </div>
                <div className="shrink-0 flex flex-col justify-center items-center w-14 gap-1">
                    <div className={`w-10 h-10 rounded border-2 flex items-center justify-center ${serverColorMap[serverTone]} ${serverTone === 'red' ? 'animate-pulse-node' : ''}`}>
                        <Icon name="Server" className="w-4 h-4" />
                    </div>
                    <div className="text-[9px] font-mono text-slate-500">SERVER</div>
                </div>
                <div className="shrink-0 flex flex-col justify-center items-center gap-1">
                    <div className="w-2 h-12 bg-slate-800 rounded overflow-hidden relative border border-slate-700">
                        <div
                            className="absolute bottom-0 left-0 right-0 transition-all duration-300"
                            style={{
                                height: `${publicPct}%`,
                                background: 'linear-gradient(to top, #f59e0b, #22d3ee)',
                            }}
                            title={`Public inventory: ${publicPct}%`}
                        />
                    </div>
                    <div className="text-[8px] font-mono text-slate-500 whitespace-nowrap">INV</div>
                </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[9px] font-mono text-slate-500">
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-sm bg-cyan-400" style={{ boxShadow: '0 0 4px rgba(34,211,238,0.7)' }} /> fan
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-sm bg-red-500" style={{ boxShadow: '0 0 4px rgba(239,68,68,0.7)' }} /> bot
                </span>
                <span className="flex items-center gap-1">
                    <Icon name="Layers" className="w-3 h-3" />{waves} lane{waves > 1 ? 's' : ''}
                </span>
            </div>
        </div>
    );
}
