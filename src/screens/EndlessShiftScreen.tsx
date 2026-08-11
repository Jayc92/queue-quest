import { useEffect, useMemo, useRef, useState } from 'react';
import type { EndlessConfig, EndlessState, EndlessRunResult, ActiveDecision } from '../game/types';
import { createEndlessState, stepEndless, endlessResultFromState, applyDecision } from '../game/endless';
import { DECISION_TIMEOUT } from '../game/decisions';
import { UI } from '../game/balance';
import { formatDuration } from '../game/format';
import { DEFAULT_CONFIG, BOT_DETECTION_OPTIONS, VERIFICATION_OPTIONS, RESALE_OPTIONS } from '../data/defaults';
import { playSound } from '../game/audio';
import { track } from '../game/analytics';
import { getDebugFlags, subscribeDebug } from '../game/debugControl';
import { Icon } from '../components/ui/Icon';
import { GameSlider } from '../components/ui/GameSlider';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ConsolePanel } from '../components/ui/primitives';

interface Props {
    onEnd: (result: EndlessRunResult) => void;
    onQuit: () => void;
}

const TICK_MS = UI.endlessTickMs;         // one shift-second per tick
const REDUCED_TICK_MS = UI.endlessTickMs; // timing unchanged; only visual motion differs


function Meter({ label, value, icon }: { label: string; value: number; icon: Parameters<typeof Icon>[0]['name'] }) {
    const status = value > 55 ? 'good' : value > 30 ? 'warning' : 'danger';
    const bar = { good: 'bg-green-500', warning: 'bg-amber-500', danger: 'bg-red-500' }[status];
    const text = { good: 'text-green-400', warning: 'text-amber-400', danger: 'text-red-400' }[status];
    return (
        <div className={`space-y-1 ${status === 'danger' ? 'animate-urgent rounded px-1 -mx-1' : ''}`}>
            <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span className={text}><Icon name={icon} className="w-3.5 h-3.5" /></span>{label}
                </span>
                <span className={`font-mono font-bold text-sm ${text}`}>{Math.round(value)}</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div className={`h-full ${bar} transition-all duration-300 ease-out`} style={{ width: `${value}%` }}
                    role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label} />
            </div>
        </div>
    );
}

export function EndlessShiftScreen({ onEnd, onQuit }: Props) {
    const [config, setConfig] = useState<EndlessConfig>(DEFAULT_CONFIG);
    const [state, setState] = useState<EndlessState>(() => createEndlessState());

    // Live wave/incident banners.
    const [banner, setBanner] = useState<{ text: string; tone: 'cyan' | 'amber' | 'red'; key: number } | null>(null);
    const bannerKey = useRef(0);

    // The config is read by the tick loop via a ref so the interval never restarts.
    const configRef = useRef(config);
    configRef.current = config;
    const onEndRef = useRef(onEnd);
    onEndRef.current = onEnd;

    const prevWave = useRef(1);
    const prevIncident = useRef<string | null>(null);
    const prevDecision = useRef<string | null>(null);

    // Developer debug flags (default off; panel only mounts under ?debug=1). Read
    // via a ref so the tick loop sees the latest without restarting the interval.
    const debugRef = useRef(getDebugFlags());
    const forceCollapseRef = useRef(getDebugFlags().forceCollapseNonce);
    useEffect(() => subscribeDebug(f => { debugRef.current = f; }), []);

    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const interval = reduced ? REDUCED_TICK_MS : TICK_MS;
        const timer = setInterval(() => {
            setState(prev => {
                if (prev.over) return prev;
                const dbg = debugRef.current;
                // Dev QA: force an immediate collapse when the panel requests it.
                if (dbg.forceCollapseNonce !== forceCollapseRef.current) {
                    forceCollapseRef.current = dbg.forceCollapseNonce;
                    const collapsed: EndlessState = { ...prev, over: true, endReason: prev.endReason ?? 'stability' };
                    const result = endlessResultFromState(collapsed);
                    setTimeout(() => onEndRef.current(result), 900);
                    return collapsed;
                }
                const next = stepEndless(prev, configRef.current, { suppressIncidents: dbg.suppressIncidents });

                // Wave-up banner.
                if (next.wave > prevWave.current) {
                    prevWave.current = next.wave;
                    bannerKey.current += 1;
                    setBanner({ text: `WAVE ${next.wave} — Pressure rising`, tone: 'cyan', key: bannerKey.current });
                    playSound('warning');
                }
                // Incident banner.
                const incidentId = next.activeIncident?.id ?? null;
                if (incidentId && incidentId !== prevIncident.current) {
                    bannerKey.current += 1;
                    setBanner({ text: `INCIDENT — ${next.activeIncident!.alert}`, tone: 'red', key: bannerKey.current });
                    playSound('warning');
                }
                prevIncident.current = incidentId;

                // A new operational decision just slid in — alert cue.
                // Key on def.id + tick so re-offers of the same scenario still fire.
                const decisionKey = next.activeDecision
                    ? `${next.activeDecision.def.id}:${next.tick + next.activeDecision.ticksRemaining}`
                    : null;
                if (decisionKey && decisionKey !== prevDecision.current) {
                    playSound('decision');
                }
                prevDecision.current = decisionKey;

                if (next.over) {
                    playSound('fail');
                    // Defer the parent transition out of the setState updater.
                    const result = endlessResultFromState(next);
                    setTimeout(() => onEndRef.current(result), 900);
                }
                return next;
            });
        }, interval);
        return () => clearInterval(timer);
    }, []);

    // Auto-dismiss banner.
    useEffect(() => {
        if (!banner) return;
        const t = setTimeout(() => setBanner(b => (b && b.key === banner.key ? null : b)), 2600);
        return () => clearTimeout(t);
    }, [banner]);

    // Emit an analytics event whenever a decision expires unanswered. Driven off
    // the tally (not the tick updater) so it fires exactly once per ignored call,
    // even under StrictMode double-invocation.
    const prevIgnored = useRef(0);
    useEffect(() => {
        if (state.tally.ignored > prevIgnored.current) {
            const last = state.history[state.history.length - 1];
            track('decision_ignored', { decisionId: last?.decisionId, tick: state.tick });
            prevIgnored.current = state.tally.ignored;
        }
    }, [state.tally.ignored, state.history, state.tick]);

    const updateConfig = <K extends keyof EndlessConfig>(key: K, value: EndlessConfig[K]) =>
        setConfig(prev => ({ ...prev, [key]: value }));

    // Player answers the on-screen decision. Applies immediately; meters react
    // on the next tick via the resulting modifier.
    const handleDecision = (optionId: 'yes' | 'no') => {
        // Fire side effects once, here (a user click), not inside the setState
        // updater — StrictMode may invoke updaters twice in development.
        const active = state.activeDecision;
        if (state.over || !active) return;
        const option = active.def.options.find(o => o.id === optionId);
        playSound(option?.correct ? 'decision_correct' : 'decision_wrong');
        track('decision_taken', { decisionId: active.def.id, option: optionId, correct: option?.correct ?? false, tick: state.tick });
        setState(prev => (prev.over || !prev.activeDecision ? prev : applyDecision(prev, optionId)));
    };

    const scoreKey = useMemo(() => state.operatorScore, [state.operatorScore]);

    const bannerTone = banner
        ? { cyan: 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300', amber: 'border-amber-500/50 bg-amber-500/15 text-amber-300', red: 'border-red-500/50 bg-red-500/15 text-red-300' }[banner.tone]
        : '';

    return (
        <div className="min-h-screen grid-bg pb-6">
            {/* Sticky HUD */}
            <div className="sticky top-0 z-30 bg-terminal-bg/95 backdrop-blur border-b border-slate-800 px-3 py-2">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
                    <button onClick={onQuit} className="qq-press flex items-center gap-1.5 text-slate-400 hover:text-white py-1 px-1 shrink-0" aria-label="End shift">
                        <Icon name="X" className="w-4 h-4" />
                        <span className="text-xs hidden sm:inline">End</span>
                    </button>
                    <div className="flex items-center gap-2 md:gap-3 overflow-x-auto no-scrollbar flex-1 justify-end">
                        <HudChip label="Shift" value={formatDuration(state.tick)} icon="Clock" tone="cyan" />
                        <HudChip label="Wave" value={`${state.wave}`} icon="Layers" tone="amber" />
                        <HudChip label="Combo" value={`x${state.combo}`} icon="Zap" tone={state.combo >= 10 ? 'green' : 'cyan'} pulse={state.combo >= 10} />
                        <div key={scoreKey} className="shrink-0 flex items-center gap-2 px-2 py-1 rounded border border-cyan-500/40 bg-slate-900/40 min-w-fit animate-value-pulse">
                            <span className="text-cyan-400 opacity-80"><Icon name="Star" className="w-3.5 h-3.5" /></span>
                            <div className="leading-none">
                                <div className="text-[9px] font-mono uppercase tracking-wider opacity-70 text-cyan-400">Score</div>
                                <div className="text-sm font-mono font-bold tabular-nums text-white">{state.operatorScore.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-3 md:p-4 space-y-3 md:space-y-4">
                {/* Wave / incident banner */}
                <div className="h-9 flex items-center justify-center">
                    {banner && (
                        <div key={banner.key} className={`animate-badge-pop px-3 py-1.5 rounded border text-xs font-mono font-bold uppercase tracking-wider text-center ${bannerTone}`}>
                            {banner.text}
                        </div>
                    )}
                </div>

                {/* Live operational decision — slides in, expires in ~10s if ignored */}
                {state.activeDecision && (
                    <DecisionCard decision={state.activeDecision} onAnswer={handleDecision} />
                )}

                {/* Current incident indicator */}
                <div className="panel px-3 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Current Incident</span>
                    {state.activeIncident ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
                            <span className="animate-blink"><Icon name="Alert" className="w-3.5 h-3.5" /></span>
                            {state.activeIncident.label}
                            <span className="text-slate-500 font-mono">({state.activeIncident.ticksRemaining}s)</span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 text-xs text-green-400">
                            <Icon name="Check" className="w-3.5 h-3.5" /> Nominal
                        </span>
                    )}
                </div>

                {/* Survival meters */}
                <ConsolePanel title="Shift Vitals" icon="Activity" status={
                    Math.min(state.stability, state.fairness, state.fanPatience) < 30 ? 'danger'
                        : Math.min(state.stability, state.fairness, state.fanPatience) < 55 ? 'warning' : 'good'
                }>
                    <div className="space-y-3">
                        <Meter label="Stability" value={state.stability} icon="Server" />
                        <Meter label="Fairness" value={state.fairness} icon="Scale" />
                        <Meter label="Fan Patience" value={state.fanPatience} icon="Heart" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800 text-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400">Fans Served</span>
                            <span className="font-mono text-cyan-400">{state.fansServed.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400">Bots Blocked</span>
                            <span className="font-mono text-green-400">{state.botsBlocked.toLocaleString()}</span>
                        </div>
                    </div>
                </ConsolePanel>

                {/* Live lever controls */}
                <ConsolePanel title="Identity & Bot Defense" icon="Shield">
                    <div className="space-y-4">
                        <SegmentedControl label="Bot Detection" options={BOT_DETECTION_OPTIONS}
                            value={config.botDetection} onChange={v => updateConfig('botDetection', v)} />
                        <SegmentedControl label="Fan Verification" options={VERIFICATION_OPTIONS}
                            value={config.verification} onChange={v => updateConfig('verification', v)} />
                    </div>
                </ConsolePanel>

                <ConsolePanel title="Queue & Purchase" icon="Clock">
                    <div className="space-y-5">
                        <GameSlider label="Entry Wave Count" value={config.waveCount}
                            onChange={v => updateConfig('waveCount', v)} min={1} max={8}
                            helpText="More waves relieve server load; too many over-stress it." />
                        <GameSlider label="Purchase Limit" value={config.purchaseLimit}
                            onChange={v => updateConfig('purchaseLimit', v)} min={1} max={8} unit=" tix"
                            helpText="Lower spreads tickets and lifts fairness." />
                        <SegmentedControl label="Resale Policy" options={RESALE_OPTIONS} columns={4}
                            value={config.resale} onChange={v => updateConfig('resale', v)} />
                    </div>
                </ConsolePanel>

                <ConsolePanel title="Inventory Allocation" icon="Layers">
                    <div className="space-y-5">
                        <GameSlider label="VIP / Presale Reserve" value={config.presalePercent}
                            onChange={v => updateConfig('presalePercent', v)} min={0} max={50} unit="%"
                            helpText="Presale relieves public load but pressures fairness at high levels." />
                        <GameSlider label="Accessible Priority" value={config.accessiblePercent}
                            onChange={v => updateConfig('accessiblePercent', v)} min={1} max={15} unit="%"
                            helpText="Coverage protects fairness during accessibility incidents." />
                    </div>
                </ConsolePanel>
            </div>
        </div>
    );
}

function HudChip({ label, value, icon, tone, pulse }: {
    label: string; value: string; icon: Parameters<typeof Icon>[0]['name'];
    tone: 'cyan' | 'amber' | 'green'; pulse?: boolean;
}) {
    const cls = { cyan: 'border-cyan-500/40 text-cyan-400', amber: 'border-amber-500/40 text-amber-400', green: 'border-green-500/40 text-green-400' }[tone];
    return (
        <div className={`shrink-0 flex items-center gap-2 px-2 py-1 rounded border ${cls} bg-slate-900/40 min-w-fit ${pulse ? 'animate-urgent' : ''}`}>
            <span className="opacity-80"><Icon name={icon} className="w-3.5 h-3.5" /></span>
            <div className="leading-none">
                <div className="text-[9px] font-mono uppercase tracking-wider opacity-70">{label}</div>
                <div className="text-sm font-mono font-bold tabular-nums">{value}</div>
            </div>
        </div>
    );
}

// The live operational decision card. Slides in from the right, shows the two
// options with their tradeoffs, and a shrinking urgency bar. Answering applies
// immediately; ignoring lets it expire (still a valid, tallied outcome).
function DecisionCard({ decision, onAnswer }: { decision: ActiveDecision; onAnswer: (id: 'yes' | 'no') => void }) {
    const { def, ticksRemaining } = decision;
    const pct = Math.max(0, Math.min(100, (ticksRemaining / DECISION_TIMEOUT) * 100));
    const urgent = ticksRemaining <= 3;

    return (
        // key on def.id so React remounts (re-runs the slide-in) for each new decision
        <div key={def.id} className="animate-decision-in">
            <div className="panel animate-decision-alert rounded-lg border-amber-500/60 p-3 md:p-4 space-y-3">
                {/* Alert header */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-amber-400 shrink-0 animate-blink"><Icon name="Alert" className="w-4 h-4" /></span>
                        <div className="min-w-0">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">Operations Decision</div>
                            <div className="text-sm font-semibold text-amber-100 truncate">{def.alert}</div>
                        </div>
                    </div>
                    <div className={`shrink-0 font-mono text-sm font-bold tabular-nums ${urgent ? 'text-red-400 animate-countdown' : 'text-amber-300'}`}>
                        {ticksRemaining}s
                    </div>
                </div>

                {/* The question */}
                <div className="text-base font-bold text-white">{def.question}</div>

                {/* Urgency bar */}
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ease-linear ${urgent ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                </div>

                {/* Options with tradeoffs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {def.options.map(o => (
                        <button key={o.id} onClick={() => onAnswer(o.id)}
                            className="qq-press text-left rounded-lg border border-slate-700 bg-slate-900/50 hover:border-cyan-500/60 hover:bg-slate-800/60 p-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-semibold text-white">{o.label}</span>
                                <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-600 text-slate-400">
                                    {o.id === 'yes' ? 'YES' : 'NO'}
                                </span>
                            </div>
                            <div className="space-y-0.5">
                                {o.tradeoffs.map((t, i) => (
                                    <div key={i} className={`flex items-center gap-1.5 text-[11px] ${t.good ? 'text-green-400' : 'text-amber-400'}`}>
                                        <span aria-hidden className="font-mono font-bold w-3 text-center">{t.good ? '↓' : '↑'}</span>
                                        <span>{t.label}{t.good ? ' (improves)' : ' (worsens)'}</span>
                                    </div>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>

                <div className="text-[10px] text-slate-500 text-center">Ignore to hold current operations.</div>
            </div>
        </div>
    );
}
