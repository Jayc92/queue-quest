import { useEffect, useMemo, useState } from 'react';
import type { Level, GameConfig, IconName } from '../game/types';
import { calculateProjections } from '../game/projections';
import { Icon } from '../components/ui/Icon';

type Tone = 'cyan' | 'amber' | 'red' | 'green';

interface Phase {
    label: string;
    detail: string;
    icon: IconName;
    tone: Tone;
}

interface Props {
    level: Level;
    config: GameConfig;
    onComplete: () => void;
}

export function SimulationScreen({ level, config, onComplete }: Props) {
    const [phase, setPhase] = useState(0);
    const phases = useMemo<Phase[]>(() => {
        const proj = calculateProjections(level, config);
        const heavyLoad = proj.loadRisk > 65;
        const highBots = proj.botExposure > 55;
        const wavesActive = config.waveCount > 1;
        const thinPublic = proj.publicPercent < 55;
        return [
            { label: 'Opening waiting room...', detail: `${config.waitingRoomTime}h before doors`, icon: 'Clock', tone: 'cyan' },
            {
                label: highBots ? 'Bots flooding filter...' : 'Bot filter engaged...',
                detail: highBots ? 'High leakage detected' : 'Nominal filter response',
                icon: 'Bot',
                tone: highBots ? 'red' : 'green',
            },
            {
                label: wavesActive ? `Releasing ${config.waveCount} waves...` : 'Single-wave release...',
                detail: wavesActive ? `${config.waveInterval}m stagger` : 'All fans at once',
                icon: 'Users',
                tone: wavesActive ? 'cyan' : 'amber',
            },
            {
                label: heavyLoad ? 'Server load peaking...' : 'Checkout stable...',
                detail: heavyLoad ? 'Stress on infrastructure' : 'Load within tolerance',
                icon: 'Server',
                tone: heavyLoad ? 'red' : 'green',
            },
            {
                label: thinPublic ? 'Public inventory tight...' : 'Allocating tickets...',
                detail: thinPublic ? 'Presale ate the public pool' : `${proj.publicInventory.toLocaleString()} public seats`,
                icon: 'Ticket',
                tone: thinPublic ? 'amber' : 'cyan',
            },
        ];
    }, [level, config]);

    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const interval = reduced ? 60 : 350;
        let i = 0;
        const timer = setInterval(() => {
            i++;
            if (i >= phases.length) {
                clearInterval(timer);
                setTimeout(onComplete, reduced ? 60 : 350);
            } else {
                setPhase(i);
            }
        }, interval);
        return () => clearInterval(timer);
    }, [onComplete, phases.length]);

    const toneMap: Record<Tone, { ring: string; bg: string; text: string; pulse: string }> = {
        cyan: { ring: 'border-cyan-500/50', bg: 'bg-cyan-500/10', text: 'text-cyan-400', pulse: 'border-cyan-500/30' },
        amber: { ring: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-400', pulse: 'border-amber-500/30' },
        red: { ring: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-400', pulse: 'border-red-500/30' },
        green: { ring: 'border-green-500/50', bg: 'bg-green-500/10', text: 'text-green-400', pulse: 'border-green-500/30' },
    };
    const current = phases[phase];
    const t = toneMap[current.tone];

    return (
        <div className="min-h-screen grid-bg flex items-center justify-center p-6">
            <div className="text-center max-w-sm w-full">
                <div className={`w-20 h-20 mx-auto mb-5 rounded-full border-2 ${t.ring} ${t.bg} flex items-center justify-center ${t.text} relative`}>
                    <Icon name={current.icon} className="w-10 h-10" />
                    <div className={`absolute inset-0 rounded-full border-2 ${t.pulse} animate-ping`} />
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Onsale in Progress</div>
                <h2 className="text-lg font-bold text-white mb-1">{current.label}</h2>
                <p className={`text-xs ${t.text} mb-6 font-mono`}>{current.detail}</p>

                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 transition-all duration-300"
                        style={{ width: `${((phase + 1) / phases.length) * 100}%` }} />
                </div>
                <div className="flex justify-center gap-1.5 mt-3">
                    {phases.map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i <= phase ? 'bg-cyan-500' : 'bg-slate-700'}`} />
                    ))}
                </div>

                <div className="mt-6 space-y-1">
                    {phases.slice(0, phase + 1).map((p, i) => (
                        <div key={i} className={`text-left text-[11px] font-mono px-2 py-1 rounded ${i === phase ? 'bg-slate-800/80' : 'opacity-50'}`}>
                            <span className={toneMap[p.tone].text}>▸</span>
                            <span className="text-slate-300 ml-2">{p.label}</span>
                            <span className="text-slate-500 ml-2">— {p.detail}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
