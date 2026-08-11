import { useMemo, useRef, useState } from 'react';
import type { GameConfig, IconName } from '../game/types';
import { DEFAULT_CONFIG, BOT_DETECTION_OPTIONS, VERIFICATION_OPTIONS, TRAINING_LEVEL } from '../data/defaults';
import { calculateProjections } from '../game/projections';
import { runSimulation } from '../game/simulation';
import { playSound } from '../game/audio';
import { Icon } from '../components/ui/Icon';
import { GameSlider } from '../components/ui/GameSlider';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ConsolePanel, RiskMeter } from '../components/ui/primitives';
import { PressureHUD } from '../components/game/PressureHUD';
import { QueueTraffic } from '../components/game/QueueTraffic';

interface Props {
    onComplete: () => void;   // finished training → unlock/continue to Mission 1
    onSkip: () => void;       // skip straight to the Mission Board
}

// A training-friendly starting config: single wave & light defense so the first
// lessons visibly move the meters when the player follows the coaching.
const TRAINING_START: GameConfig = {
    ...DEFAULT_CONFIG,
    botDetection: 'low',
    verification: 'none',
    waveCount: 1,
    presalePercent: 15,
    accessiblePercent: 5,
};

// Which console section a step highlights (drives the focus ring + auto-scroll).
type Focus = 'none' | 'hud' | 'traffic' | 'waves' | 'defense' | 'inventory' | 'projections' | 'launch';

interface Step {
    title: string;
    icon: IconName;
    body: string;
    focus: Focus;
    // Optional concrete nudge the player can apply in one tap to see the effect.
    action?: { label: string; apply: (c: GameConfig) => GameConfig; done: (c: GameConfig) => boolean };
}

const STEPS: Step[] = [
    {
        title: 'Welcome to the console',
        icon: 'Activity',
        body: "You're the operator for a ticket onsale. Your job: get real fans through, keep bots out, and hold the systems together. Let's walk through it — one control at a time.",
        focus: 'none',
    },
    {
        title: 'Queue pressure',
        icon: 'Users',
        body: 'Far more fans want tickets than there are seats. That pressure hits your server all at once when doors open. The top HUD shows demand, bot probing, and server status live.',
        focus: 'hud',
    },
    {
        title: 'Entry waves relieve load',
        icon: 'Layers',
        body: 'Releasing everyone at once overwhelms the server. Splitting entry into waves spreads the load. Try raising Entry Waves to 3 and watch Load Spike Risk drop.',
        focus: 'waves',
        action: { label: 'Set Entry Waves to 3', apply: c => ({ ...c, waveCount: 3 }), done: c => c.waveCount >= 3 },
    },
    {
        title: 'Bot defense',
        icon: 'Shield',
        body: 'Bots try to grab tickets before fans can. Stronger Bot Detection blocks more of them — but adds friction that can slow real fans too. Raise it to Enhanced.',
        focus: 'defense',
        action: { label: 'Set Bot Detection to Enhanced', apply: c => ({ ...c, botDetection: 'high' }), done: c => c.botDetection === 'high' || c.botDetection === 'aggressive' },
    },
    {
        title: 'Fairness',
        icon: 'Scale',
        body: 'Fairness is about tickets reaching everyday fans, not scalpers or bulk buyers. Reserving accessible seats and keeping purchase limits sensible both help. Nudge Accessible Priority up a little.',
        focus: 'inventory',
        action: { label: 'Set Accessible to 8%', apply: c => ({ ...c, accessiblePercent: 8 }), done: c => c.accessiblePercent >= 8 },
    },
    {
        title: 'Read the projections',
        icon: 'Target',
        body: "Before you launch, the Live Projections panel forecasts the outcome — bot exposure, fan friction, load risk, fairness. Green is good. It updates the instant you change a control, so you can tune before committing.",
        focus: 'projections',
    },
    {
        title: 'Launch the onsale',
        icon: 'Zap',
        body: "When you launch a real mission, watch the live sequence — it shows how your choices affect traffic, bots, and server load before the score lands. Go ahead and launch — you can't fail training.",
        focus: 'launch',
    },
];

// A compact result debrief tailored to training — friendly, no failure framing.
function TrainingDebrief({ config, onDone }: { config: GameConfig; onDone: () => void }) {
    const r = useMemo(() => runSimulation(TRAINING_LEVEL, config), [config]);
    const rows: { label: string; value: string; icon: IconName; good: boolean }[] = [
        { label: 'Fans Served', value: `${r.fansServedPct}%`, icon: 'Users', good: r.fansServedPct >= 40 },
        { label: 'Bots Blocked', value: `${r.botsBlockedPct}%`, icon: 'Shield', good: r.botsBlockedPct >= 60 },
        { label: 'Stability', value: `${r.siteStability}`, icon: 'Server', good: r.siteStability >= 55 },
        { label: 'Fairness', value: `${r.fairness}`, icon: 'Scale', good: r.fairness >= 60 },
    ];
    return (
        <div className="min-h-screen grid-bg flex items-center justify-center p-4 md:p-6">
            <div className="max-w-lg w-full">
                <div className="panel overflow-hidden border-green-500/40 animate-system-online">
                    <div className="p-5 md:p-6 text-center bg-green-500/10">
                        <div className="w-16 h-16 mx-auto mb-3 rounded-full border-2 border-green-400 bg-green-500/20 flex items-center justify-center text-green-400 animate-medal">
                            <Icon name="Check" className="w-8 h-8" />
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-green-400 mb-1">Training Complete</div>
                        <h1 className="text-2xl font-bold text-white mb-1">You're ready</h1>
                        <p className="text-sm text-slate-300">Here's how your rehearsal onsale scored.</p>
                    </div>
                    <div className="p-4 md:p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            {rows.map((row, i) => (
                                <div key={i} className="panel p-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] uppercase tracking-wider text-slate-400">{row.label}</span>
                                        <span className={row.good ? 'text-green-400' : 'text-amber-400'}><Icon name={row.icon} className="w-3.5 h-3.5" /></span>
                                    </div>
                                    <div className={`text-2xl font-mono font-bold tabular-nums ${row.good ? 'text-green-400' : 'text-amber-400'}`}>{row.value}</div>
                                </div>
                            ))}
                        </div>
                        <div className="p-3 rounded border border-cyan-500/30 bg-cyan-500/5 flex items-start gap-3">
                            <span className="text-cyan-400 shrink-0 mt-0.5"><Icon name="Target" className="w-4 h-4" /></span>
                            <p className="text-sm text-slate-200">
                                In the campaign, every mission has its own threats and a target score. Read the briefing,
                                watch the projections, and adjust. The debrief always tells you what to fix next.
                            </p>
                        </div>
                        <button
                            onClick={onDone}
                            className="qq-press w-full flex items-center justify-center gap-2 px-4 py-4 bg-cyan-500 hover:bg-cyan-400 font-bold rounded transition-all glow-cyan"
                            style={{ color: '#0a0e14' }}
                        >
                            <span>Start the Campaign</span>
                            <Icon name="ArrowRight" className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function TrainingScreen({ onComplete, onSkip }: Props) {
    const [config, setConfig] = useState<GameConfig>(TRAINING_START);
    const [stepIdx, setStepIdx] = useState(0);
    const [launched, setLaunched] = useState(false);

    const projections = useMemo(() => calculateProjections(TRAINING_LEVEL, config), [config]);
    const step = STEPS[stepIdx];
    const isLast = stepIdx === STEPS.length - 1;

    const focusRefs = {
        waves: useRef<HTMLDivElement>(null),
        defense: useRef<HTMLDivElement>(null),
        inventory: useRef<HTMLDivElement>(null),
        projections: useRef<HTMLDivElement>(null),
        launch: useRef<HTMLDivElement>(null),
    };

    const update = <K extends keyof GameConfig>(key: K, value: GameConfig[K]) =>
        setConfig(prev => ({ ...prev, [key]: value }));

    const advance = () => {
        if (isLast) return;
        playSound('button');
        const next = stepIdx + 1;
        setStepIdx(next);
        const f = STEPS[next].focus;
        const ref = (focusRefs as Record<string, React.RefObject<HTMLDivElement>>)[f];
        if (ref?.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }
    };

    const back = () => { if (stepIdx > 0) { playSound('button'); setStepIdx(stepIdx - 1); } };

    const applyAction = () => {
        if (!step.action) return;
        playSound('slider');
        setConfig(prev => step.action!.apply(prev));
    };

    const launch = () => {
        playSound('launch');
        setLaunched(true);
    };

    if (launched) return <TrainingDebrief config={config} onDone={onComplete} />;

    // A section wrapper that shows a cyan focus ring when the current step targets it.
    const focused = (f: Focus) => step.focus === f;
    const ring = (f: Focus) => focused(f) ? 'ring-2 ring-cyan-400 rounded-lg' : '';

    return (
        <div className="min-h-screen grid-bg pb-64 lg:pb-40">
            {/* Header */}
            <div className="sticky top-0 z-30 bg-terminal-bg/95 backdrop-blur border-b border-slate-800 px-3 py-2">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-cyan-400">
                        <Icon name="Play" className="w-4 h-4" />
                        <span className="text-sm font-bold text-white">Training Shift</span>
                    </div>
                    <button onClick={onSkip} className="qq-press text-xs text-slate-400 hover:text-white py-1 px-2 rounded border border-slate-700 hover:border-slate-500">
                        Skip Training
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-3 md:p-4 space-y-3">
                <div className={ring('hud')}>
                    <PressureHUD level={TRAINING_LEVEL} projections={projections} config={config} />
                </div>
                <div className={ring('traffic')}>
                    <QueueTraffic level={TRAINING_LEVEL} projections={projections} config={config} />
                </div>

                <div ref={focusRefs.waves} className={`transition-all ${ring('waves')}`}>
                    <ConsolePanel title="Queue Timing" icon="Clock">
                        <GameSlider label="Entry Wave Count" value={config.waveCount}
                            onChange={v => update('waveCount', v)} min={1} max={8}
                            helpText="Splits the crowd into batches so the server isn't hit all at once. 2–4 protects stability." />
                    </ConsolePanel>
                </div>

                <div ref={focusRefs.defense} className={`transition-all ${ring('defense')}`}>
                    <ConsolePanel title="Identity & Bot Defense" icon="Shield">
                        <div className="space-y-4">
                            <SegmentedControl label="Bot Detection" options={BOT_DETECTION_OPTIONS}
                                value={config.botDetection} onChange={v => update('botDetection', v)}
                                helpText="Stronger settings block more bots but add friction that can slow real fans." />
                            <SegmentedControl label="Fan Verification" options={VERIFICATION_OPTIONS}
                                value={config.verification} onChange={v => update('verification', v)}
                                helpText="Proof of identity at sign-up. Use stronger checks only when bots are a real threat." />
                        </div>
                    </ConsolePanel>
                </div>

                <div ref={focusRefs.inventory} className={`transition-all ${ring('inventory')}`}>
                    <ConsolePanel title="Inventory Allocation" icon="Layers">
                        <div className="space-y-5">
                            <GameSlider label="Accessible Priority" value={config.accessiblePercent}
                                onChange={v => update('accessiblePercent', v)} min={1} max={15} unit="%"
                                helpText="Seats reserved for accessible access. Higher coverage lifts fairness." />
                            <GameSlider label="Purchase Limit" value={config.purchaseLimit}
                                onChange={v => update('purchaseLimit', v)} min={1} max={8} unit=" tix"
                                helpText="Max tickets per buyer. Lower spreads seats across more fans." />
                        </div>
                    </ConsolePanel>
                </div>

                <div ref={focusRefs.projections} className={`transition-all ${ring('projections')}`}>
                    <ConsolePanel title="Live Projections" icon="Activity">
                        <div className="space-y-3">
                            <RiskMeter label="Bot Exposure" value={projections.botExposure} thresholds={{ low: 25, high: 55 }} />
                            <RiskMeter label="Fan Friction" value={projections.fanFriction} thresholds={{ low: 12, high: 30 }} />
                            <RiskMeter label="Load Spike Risk" value={projections.loadRisk} thresholds={{ low: 35, high: 65 }} />
                            <RiskMeter label="Fairness Projection" value={projections.fairnessEstimate} thresholds={{ low: 45, high: 70 }} inverted />
                        </div>
                    </ConsolePanel>
                </div>
            </div>

            {/* Coach panel — fixed at the bottom, teaches one concept at a time */}
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-terminal-bg border-t-2 border-cyan-500/40">
                <div className="max-w-4xl mx-auto p-3 md:p-4">
                    <div ref={focusRefs.launch} className={`panel p-3 md:p-4 ${focused('launch') ? 'ring-2 ring-cyan-400 rounded-lg' : ''}`}>
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                                <Icon name={step.icon} className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <h3 className="text-sm font-bold text-white">{step.title}</h3>
                                    <span className="text-[10px] font-mono text-slate-500 shrink-0">Step {stepIdx + 1}/{STEPS.length}</span>
                                </div>
                                <p className="text-xs md:text-sm text-slate-300 leading-snug">{step.body}</p>

                                {step.action && (
                                    <button
                                        onClick={applyAction}
                                        disabled={step.action.done(config)}
                                        className={`mt-2 qq-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-all ${
                                            step.action.done(config)
                                                ? 'border-green-500/40 bg-green-500/10 text-green-400 cursor-default'
                                                : 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                                        }`}
                                    >
                                        <Icon name={step.action.done(config) ? 'Check' : 'Zap'} className="w-3.5 h-3.5" />
                                        <span>{step.action.done(config) ? 'Done' : step.action.label}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Progress dots + navigation */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
                            <div className="flex gap-1.5" aria-hidden>
                                {STEPS.map((_, i) => (
                                    <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i <= stepIdx ? 'bg-cyan-500' : 'bg-slate-700'}`} />
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                {stepIdx > 0 && (
                                    <button onClick={back} className="qq-press flex items-center gap-1 text-xs text-slate-400 hover:text-white py-2 px-3 rounded border border-slate-700">
                                        <Icon name="ArrowLeft" className="w-3.5 h-3.5" />
                                        <span>Back</span>
                                    </button>
                                )}
                                {isLast ? (
                                    <button
                                        onClick={launch}
                                        className="qq-press flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-400 font-bold text-sm rounded glow-green"
                                        style={{ color: '#0a0e14' }}
                                    >
                                        <Icon name="Zap" className="w-4 h-4" />
                                        <span>Launch Onsale</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={advance}
                                        className="qq-press flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 font-bold text-sm rounded glow-cyan"
                                        style={{ color: '#0a0e14' }}
                                    >
                                        <span>Next</span>
                                        <Icon name="ArrowRight" className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
