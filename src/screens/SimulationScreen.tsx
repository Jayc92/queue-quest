// Queue Quest — Launch Onsale anticipation sequence.
//
// The ~4-second "did I configure this correctly?" moment between LAUNCH ONSALE
// and the Results reveal. A compact live pipeline (waiting room → bot filter →
// server → checkout → inventory) plays an escalating sequence whose every meter,
// counter, and warning comes from the ALREADY-COMPUTED deterministic result via
// buildLaunchSequence() — controlled runs look controlled, struggling runs
// visibly struggle, and the final score is never shown before Results.
//
// A subtle Skip appears after the first second (keyboard: the button, or Escape).
// Reduced-motion compresses the timeline and skips packet animation while keeping
// every informational state.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Level, GameConfig, SimulationResult, IconName } from '../game/types';
import { calculateProjections } from '../game/projections';
import { applyScenario } from '../game/scenario';
import { buildLaunchSequence, LAUNCH_REDUCED_SCALE, LAUNCH_SKIP_AFTER_MS, type LaunchVisualModel, type LaunchTone } from '../game/launchSequence';
import { playSound, type SoundEvent } from '../game/audio';
import { Icon } from '../components/ui/Icon';
import { useCountUp } from '../components/ui/useCountUp';

interface Props {
    level: Level;
    config: GameConfig;
    results: SimulationResult;
    onComplete: () => void;
}

type Tone4 = 'cyan' | 'amber' | 'red' | 'green';

const toneText: Record<Tone4, string> = { cyan: 'text-cyan-400', amber: 'text-amber-400', red: 'text-red-400', green: 'text-green-400' };
const toneRing: Record<Tone4, string> = { cyan: 'border-cyan-500/50 bg-cyan-500/10', amber: 'border-amber-500/50 bg-amber-500/10', red: 'border-red-500/50 bg-red-500/10', green: 'border-green-500/50 bg-green-500/10' };
const tone3Text: Record<LaunchTone, string> = { good: 'text-green-400', warning: 'text-amber-400', danger: 'text-red-400' };
const tone3Bar: Record<LaunchTone, string> = { good: 'bg-green-500', warning: 'bg-amber-500', danger: 'bg-red-500' };

const PHASE_ICON: Record<string, IconName> = {
    live: 'Clock', surge: 'Users', botfilter: 'Bot', waves: 'Layers', checkout: 'Check', finalize: 'Activity',
};
// Sound hook per phase entry (server_warning only on genuine critical stress).
function phaseSound(model: LaunchVisualModel, id: string): SoundEvent | null {
    switch (id) {
        case 'live': return 'queue_open';
        case 'surge': return 'request_surge';
        case 'botfilter': return 'bot_filter';
        case 'waves': return model.serverCritical ? 'server_warning' : null;
        case 'checkout': return 'checkout';
        default: return null;
    }
}

export function SimulationScreen({ level, config, results, onComplete }: Props) {
    // The result was computed against the scenario-adjusted level; mirror that here
    // so the visualization's context (demand, projections) matches what actually ran.
    const eff = useMemo(() => applyScenario(level), [level]);
    const projections = useMemo(() => calculateProjections(eff, config), [eff, config]);
    const model = useMemo(() => buildLaunchSequence(eff, config, projections, results), [eff, config, projections, results]);

    const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
    const scale = reduced ? LAUNCH_REDUCED_SCALE : 1;
    const phaseMs = useCallback((i: number) => Math.round(model.phases[i].durationMs * scale), [model, scale]);

    const [phaseIdx, setPhaseIdx] = useState(0);
    const [skippable, setSkippable] = useState(false);
    const doneRef = useRef(false);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const finish = useCallback(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        timersRef.current.forEach(clearTimeout);
        playSound('result_reveal');
        onComplete();
    }, [onComplete]);

    // Phase scheduler: advance through the tension curve, then a brief settle → reveal.
    useEffect(() => {
        playSound(phaseSound(model, model.phases[0].id) ?? 'queue_open');
        let at = 0;
        for (let i = 1; i < model.phases.length; i++) {
            at += phaseMs(i - 1);
            timersRef.current.push(setTimeout(() => {
                setPhaseIdx(i);
                const s = phaseSound(model, model.phases[i].id);
                if (s) playSound(s);
            }, at));
        }
        at += phaseMs(model.phases.length - 1);
        timersRef.current.push(setTimeout(finish, at + (reduced ? 60 : 200)));
        timersRef.current.push(setTimeout(() => setSkippable(true), Math.min(LAUNCH_SKIP_AFTER_MS, at * 0.4)));
        return () => timersRef.current.forEach(clearTimeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keyboard skip: Escape (the Skip button itself is tab-reachable).
    useEffect(() => {
        if (!skippable) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [skippable, finish]);

    const phase = model.phases[phaseIdx];
    const t = toneRing[phase.tone];
    const reached = useCallback((id: string) => model.phases.findIndex(p => p.id === id) <= phaseIdx, [model, phaseIdx]);

    // Waiting-room counter runs across the live+surge phases.
    const waitingMs = phaseMs(0) + phaseMs(1);
    const waiting = useCountUp(model.demand, waitingMs);

    // Packet lane: deterministic pseudo-random packet mix (red = leaked bot share).
    const packetCount = model.requestTier === 'massive' ? 12 : model.requestTier === 'mid' ? 9 : 6;
    const redPackets = Math.round((1 - model.botBlockedPct / 100) * packetCount);

    return (
        <div className="min-h-screen grid-bg flex items-center justify-center p-4">
            <div className="max-w-sm w-full">
                {/* Phase headline — announced to assistive tech as it escalates */}
                <div role="status" aria-live="polite" className="text-center mb-3">
                    <div className={`w-14 h-14 mx-auto mb-3 rounded-full border-2 ${t} flex items-center justify-center ${toneText[phase.tone]} relative`}>
                        <span key={phaseIdx} className="animate-medal inline-block"><Icon name={PHASE_ICON[phase.id]} className="w-7 h-7" /></span>
                        <div className={`absolute inset-0 rounded-full border-2 ${toneRing[phase.tone]} animate-ping`} aria-hidden="true" />
                    </div>
                    <div className={`text-xs font-mono uppercase tracking-widest font-bold ${toneText[phase.tone]}`}>{phase.label}</div>
                    <p className="text-[11px] text-slate-400 mt-1 min-h-[28px] leading-snug">{phase.detail}</p>
                </div>

                {/* Request packets — organized waves group up; a single wave is one burst */}
                <div className="relative h-5 rounded bg-slate-900/60 border border-slate-800 overflow-hidden mb-2" aria-hidden="true">
                    {Array.from({ length: packetCount }).map((_, i) => {
                        const isBot = i < redPackets ? (i * 37) % 3 !== 0 : false;
                        const group = model.waveStyle === 'single-surge' ? 0 : i % Math.max(2, Math.min(4, model.waveCount));
                        const delay = model.waveStyle === 'single-surge'
                            ? (i * 0.06) % 0.3
                            : group * 0.55 + ((i * 29) % 10) / 40;
                        const active = reached('surge') && !reduced;
                        return (
                            <span
                                key={i}
                                className={`absolute top-1/2 -translate-y-1/2 left-0 w-1.5 h-1.5 rounded-sm ${isBot ? 'bg-red-500' : 'bg-cyan-400'} ${active ? 'animate-queue-flow' : ''}`}
                                style={{
                                    animationDelay: `${delay}s`,
                                    animationDuration: `${model.requestTier === 'massive' ? 1.4 : 2}s`,
                                    boxShadow: isBot ? '0 0 5px rgba(239,68,68,0.7)' : '0 0 5px rgba(34,211,238,0.7)',
                                    opacity: active ? 1 : 0.25,
                                    left: reduced ? `${(i * 83) % 90}%` : 0,
                                }}
                            />
                        );
                    })}
                </div>

                {/* Pipeline — each node lights up as its phase arrives */}
                <div className="space-y-1.5">
                    <PipelineNode active={reached('live')} icon="Users" label="WAITING ROOM" tone="good">
                        <span className="font-mono tabular-nums text-cyan-300">{waiting.toLocaleString('en-US')}</span>
                        <span className="text-slate-500"> waiting</span>
                    </PipelineNode>

                    <PipelineNode active={reached('botfilter')} icon="Bot" label="BOT FILTER" tone={model.botTone}
                        chip={reached('botfilter') ? (model.botLeaked ? { text: 'BOT LEAK', tone: model.botTone === 'danger' ? 'danger' : 'warning' } : { text: 'CONTAINED', tone: 'good' }) : undefined}>
                        <Meter active={reached('botfilter')} pct={model.botBlockedPct} tone={model.botTone} durationMs={phaseMs(2)} reduced={reduced} />
                        <span className={`font-mono tabular-nums text-[11px] ${tone3Text[model.botTone]}`}>{reached('botfilter') ? `${model.botBlockedPct}% blocked` : 'standing by'}</span>
                    </PipelineNode>

                    <PipelineNode active={reached('waves')} icon="Server" label="SERVER" tone={model.serverTone}
                        shake={model.serverCritical && reached('waves') && !reduced}
                        chip={reached('waves')
                            ? (model.serverCritical ? { text: 'LOAD CRITICAL', tone: 'danger' } : { text: model.waveCount === 1 ? 'SINGLE WAVE' : `${model.waveCount} WAVES`, tone: model.serverTone })
                            : undefined}>
                        <Meter active={reached('waves')} pct={model.serverLoadPct} tone={model.serverTone} durationMs={phaseMs(3)} reduced={reduced} />
                        <span className={`font-mono tabular-nums text-[11px] ${tone3Text[model.serverTone]}`}>{reached('waves') ? `load ${model.serverLoadPct}%` : 'standing by'}</span>
                    </PipelineNode>

                    <PipelineNode active={reached('checkout')} icon="Check" label="CHECKOUT" tone={model.checkoutStruggling ? 'danger' : 'good'}
                        chip={reached('checkout')
                            ? (model.checkoutStruggling ? { text: 'FAILURES', tone: 'danger' } : model.frictionSlow ? { text: 'VERIFY QUEUE', tone: 'warning' } : { text: 'PROCESSING', tone: 'good' })
                            : undefined}>
                        <Meter active={reached('checkout')} pct={model.checkoutPct} tone={model.checkoutStruggling ? 'danger' : 'good'} durationMs={phaseMs(4)} reduced={reduced} />
                        <span className={`font-mono tabular-nums text-[11px] ${model.checkoutStruggling ? 'text-red-400' : 'text-green-400'}`}>{reached('checkout') ? `${model.checkoutPct}% completing` : 'standing by'}</span>
                    </PipelineNode>
                </div>

                {/* Inventory countdown */}
                <div className={`mt-2 panel px-3 py-2 flex items-center justify-between transition-opacity ${reached('checkout') ? '' : 'opacity-40'}`}>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Tickets Left</span>
                    <div className="flex items-center gap-2">
                        {model.fairnessImbalance && reached('finalize') && (
                            <span className="px-1.5 py-0.5 text-[9px] font-mono rounded border border-amber-500/50 bg-amber-500/10 text-amber-400">ALLOCATION IMBALANCE</span>
                        )}
                        {reached('checkout')
                            ? <TicketsCountdown start={model.ticketsStart} end={model.ticketsEnd} durationMs={phaseMs(4) + phaseMs(5)} />
                            : <span className="font-mono font-bold tabular-nums text-white">{model.ticketsStart.toLocaleString('en-US')}</span>}
                    </div>
                </div>

                {/* Progress + skip */}
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-4" role="progressbar"
                    aria-label="Onsale progress" aria-valuemin={0} aria-valuemax={model.phases.length} aria-valuenow={phaseIdx + 1}>
                    <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${((phaseIdx + 1) / model.phases.length) * 100}%` }} />
                </div>
                <div className="flex items-center justify-center mt-3 min-h-[32px]">
                    {skippable && (
                        <button
                            onClick={finish}
                            className="qq-press text-[11px] font-mono text-slate-500 hover:text-cyan-400 py-1.5 px-3 rounded border border-slate-800 hover:border-cyan-500/40"
                        >
                            Skip to Results ▸▸
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// One pipeline stage row: dimmed until its phase arrives, then lit with its tone.
function PipelineNode({ active, icon, label, tone, chip, shake, children }: {
    active: boolean; icon: IconName; label: string; tone: LaunchTone;
    chip?: { text: string; tone: LaunchTone }; shake?: boolean;
    children: React.ReactNode;
}) {
    const chipCls: Record<LaunchTone, string> = {
        good: 'border-green-500/50 bg-green-500/10 text-green-400',
        warning: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
        danger: 'border-red-500/50 bg-red-500/10 text-red-400',
    };
    return (
        <div className={`panel px-3 py-2 transition-opacity ${active ? '' : 'opacity-40'} ${shake ? 'qq-shake' : ''} ${active && chip?.tone === 'danger' ? 'animate-urgent' : ''}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
                <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    <span className={active ? tone3Text[tone] : 'text-slate-600'}><Icon name={icon} className="w-3.5 h-3.5" /></span>
                    {label}
                </span>
                {chip && <span className={`px-1.5 py-0.5 text-[9px] font-mono rounded border ${chipCls[chip.tone]}`}>{chip.text}</span>}
            </div>
            <div className="flex items-center gap-2">{children}</div>
        </div>
    );
}

// A meter that fills to its true value over its phase's duration (jumps under reduced motion).
function Meter({ active, pct, tone, durationMs, reduced }: { active: boolean; pct: number; tone: LaunchTone; durationMs: number; reduced: boolean }) {
    return (
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
                className={`h-full ${tone3Bar[tone]}`}
                style={{ width: active ? `${pct}%` : '0%', transition: reduced ? 'none' : `width ${durationMs}ms ease-out` }}
            />
        </div>
    );
}

// Inventory countdown: seats remaining falls from start to its true end value.
function TicketsCountdown({ start, end, durationMs }: { start: number; end: number; durationMs: number }) {
    const sold = useCountUp(start - end, durationMs);
    const left = start - sold;
    return <span className={`font-mono font-bold tabular-nums ${left <= start * 0.1 ? 'text-red-400 animate-countdown' : 'text-white'}`}>{left.toLocaleString('en-US')}</span>;
}
