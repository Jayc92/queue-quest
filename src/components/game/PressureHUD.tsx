import { useEffect, useMemo, useRef, useState } from 'react';
import type { Level, GameConfig, ProjectionResult, IconName } from '../../game/types';
import { UI } from '../../game/balance';
import { Icon } from '../ui/Icon';

interface Module {
    label: string;
    value: string | number;
    icon: IconName;
    tone: 'good' | 'warning' | 'danger' | 'info';
    pulse?: boolean;
    live?: boolean;   // config-driven value that should pulse when it changes
}

const toneClasses: Record<Module['tone'], string> = {
    good: 'border-green-500/40 text-green-400',
    warning: 'border-amber-500/40 text-amber-400',
    danger: 'border-red-500/40 text-red-400',
    info: 'border-cyan-500/40 text-cyan-400',
};

interface Props {
    level: Level;
    projections: ProjectionResult;
    config: GameConfig;
}

export function PressureHUD({ level, projections }: Props) {
    const [countdown, setCountdown] = useState<number>(UI.pressureCountdownStart);
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const t = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : UI.pressureCountdownStart)), 1000);
        return () => clearInterval(t);
    }, []);

    const mins = Math.floor(countdown / 60);
    const secs = countdown % 60;

    const modules: Module[] = [
        {
            label: 'DOORS OPEN',
            value: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
            icon: 'Clock',
            tone: countdown < 30 ? 'danger' : 'info',
            pulse: countdown < 30,
        },
        {
            label: 'DEMAND',
            value: level.demand >= 1000000 ? `${(level.demand / 1000000).toFixed(1)}M` : `${(level.demand / 1000).toFixed(0)}K`,
            icon: 'Users',
            tone: 'danger',
        },
        {
            label: 'BOT PROBE',
            value: `${projections.botExposure}%`,
            icon: 'Bot',
            tone: projections.botExposure > 55 ? 'danger' : projections.botExposure > 30 ? 'warning' : 'good',
            pulse: projections.botExposure > 55,
            live: true,
        },
        {
            label: 'SERVER',
            value: projections.loadRisk > 65 ? 'STRESSED' : projections.loadRisk > 35 ? 'ELEVATED' : 'READY',
            icon: 'Server',
            tone: projections.loadRisk > 65 ? 'danger' : projections.loadRisk > 35 ? 'warning' : 'good',
            pulse: projections.loadRisk > 65,
            live: true,
        },
        {
            label: 'PUBLIC POOL',
            value: `${projections.publicPercent}%`,
            icon: 'Ticket',
            tone: projections.publicPercent < 55 ? 'warning' : projections.publicPercent < 70 ? 'info' : 'good',
            live: true,
        },
        {
            label: 'TARGET',
            value: level.parScore,
            icon: 'Target',
            tone: 'info',
        },
    ];

    // Track live module values so their number briefly pulses on change.
    const liveSignature = modules.filter(m => m.live).map(m => m.value).join('|');
    const prevSigRef = useRef(liveSignature);
    const [valueNonce, setValueNonce] = useState(0);
    useEffect(() => {
        if (prevSigRef.current !== liveSignature) {
            prevSigRef.current = liveSignature;
            setValueNonce(n => n + 1);
        }
    }, [liveSignature]);

    return (
        <div className="panel px-2 py-2 md:px-3 md:py-2.5 mb-3 overflow-hidden">
            <div className="flex items-center gap-2 md:gap-3 overflow-x-auto no-scrollbar">
                {modules.map((m, i) => {
                    // Countdown gets the color-cycling pulse; other danger modules get an urgent border glow.
                    const isCountdown = m.label === 'DOORS OPEN';
                    return (
                        <div
                            key={i}
                            className={`shrink-0 flex items-center gap-2 px-2 py-1 rounded border ${toneClasses[m.tone]} bg-slate-900/40 min-w-fit ${m.pulse && !isCountdown ? 'animate-urgent' : ''}`}
                        >
                            <span className="opacity-80"><Icon name={m.icon} className="w-3.5 h-3.5" /></span>
                            <div className="leading-none">
                                <div className="text-[9px] font-mono uppercase tracking-wider opacity-70">{m.label}</div>
                                <div
                                    key={m.live ? `${i}-${valueNonce}` : i}
                                    className={`text-sm font-mono font-bold tabular-nums inline-block ${m.pulse && isCountdown ? 'animate-countdown' : m.live ? 'animate-value-pulse' : ''}`}
                                >
                                    {m.value}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
