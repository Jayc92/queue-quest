import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Level, GameConfig } from '../game/types';
import { DEFAULT_CONFIG, BOT_DETECTION_OPTIONS, VERIFICATION_OPTIONS, RESALE_OPTIONS } from '../data/defaults';
import { calculateProjections } from '../game/projections';
import { Icon } from '../components/ui/Icon';
import { GameSlider } from '../components/ui/GameSlider';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ConsolePanel, RiskMeter, WarningAlert } from '../components/ui/primitives';
import { PressureHUD } from '../components/game/PressureHUD';
import { QueueTraffic } from '../components/game/QueueTraffic';

interface Props {
    level: Level;
    initialConfig?: GameConfig | null;
    onRunSimulation: (config: GameConfig) => void;
    onBack: () => void;
}

export function ConfigurationScreen({ level, initialConfig, onRunSimulation, onBack }: Props) {
    const [config, setConfig] = useState<GameConfig>(initialConfig || DEFAULT_CONFIG);
    const [projPanelOpen, setProjPanelOpen] = useState(false);
    const [showAllAlerts, setShowAllAlerts] = useState(false);
    const [flash, setFlash] = useState<Record<string, string>>({});

    const projections = useMemo(() => calculateProjections(level, config), [level, config]);
    const prevProjRef = useRef(projections);

    useEffect(() => {
        const prev = prevProjRef.current;
        const next = projections;
        const flashes: Record<string, string> = {};
        if (prev.botExposure !== next.botExposure) flashes['Bot Exposure'] = next.botExposure < prev.botExposure ? 'flash-green' : 'flash-red';
        if (prev.fanFriction !== next.fanFriction) flashes['Fan Friction'] = next.fanFriction < prev.fanFriction ? 'flash-green' : 'flash-amber';
        if (prev.loadRisk !== next.loadRisk) flashes['Load Spike Risk'] = next.loadRisk < prev.loadRisk ? 'flash-green' : 'flash-amber';
        if (prev.fairnessEstimate !== next.fairnessEstimate) flashes['Fairness Projection'] = next.fairnessEstimate > prev.fairnessEstimate ? 'flash-green' : 'flash-amber';
        if (prev.presalePressure !== next.presalePressure) flashes['Presale Pressure'] = 'flash-cyan';
        if (prev.accessCoverage !== next.accessCoverage) flashes['Accessibility Coverage'] = 'flash-cyan';
        if (Object.keys(flashes).length > 0) {
            setFlash(flashes);
            const t = setTimeout(() => setFlash({}), 700);
            prevProjRef.current = projections;
            return () => clearTimeout(t);
        }
        prevProjRef.current = projections;
    }, [projections]);

    const updateConfig = useCallback(<K extends keyof GameConfig>(key: K, value: GameConfig[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    }, []);
    const handleReset = () => setConfig(DEFAULT_CONFIG);

    const AlertsPanel = () => {
        if (projections.warnings.length === 0) {
            return (
                <div className="p-2 rounded border border-green-500/30 bg-green-500/5 text-xs text-green-400 flex items-center gap-1.5">
                    <Icon name="Check" className="w-3.5 h-3.5" />
                    <span>All systems within tolerance.</span>
                </div>
            );
        }
        const visible = showAllAlerts ? projections.warnings : projections.warnings.slice(0, 3);
        const hidden = projections.warnings.length - visible.length;
        return (
            <div className="space-y-1.5">
                {visible.map((w, i) => <WarningAlert key={i} warning={w} />)}
                {hidden > 0 && !showAllAlerts && (
                    <button
                        onClick={() => setShowAllAlerts(true)}
                        className="w-full text-xs text-slate-400 hover:text-cyan-400 py-1 border border-dashed border-slate-700 rounded"
                    >
                        + {hidden} more alert{hidden > 1 ? 's' : ''}
                    </button>
                )}
                {showAllAlerts && projections.warnings.length > 3 && (
                    <button
                        onClick={() => setShowAllAlerts(false)}
                        className="w-full text-xs text-slate-500 hover:text-slate-300 py-1"
                    >
                        Show less
                    </button>
                )}
            </div>
        );
    };

    const ProjectionsContent = () => (
        <div className="space-y-3">
            <RiskMeter label="Bot Exposure" value={projections.botExposure} thresholds={{ low: 25, high: 55 }}
                flashClass={flash['Bot Exposure']}
                hint={config.botDetection === 'low' ? 'Basic detection lets most bots through.' :
                      config.botDetection === 'aggressive' ? 'Maximum defense engaged.' : undefined} />
            <RiskMeter label="Fan Friction" value={projections.fanFriction} thresholds={{ low: 12, high: 30 }}
                flashClass={flash['Fan Friction']}
                hint={config.verification === 'verified' ? 'ID verification adds friction.' :
                      config.botDetection === 'aggressive' ? 'Heavy bot screening slows fans.' : undefined} />
            <RiskMeter label="Load Spike Risk" value={projections.loadRisk} thresholds={{ low: 35, high: 65 }}
                flashClass={flash['Load Spike Risk']}
                hint={config.waveCount === 1 ? 'No staggering concentrates load.' :
                      config.waveCount >= 2 && config.waveCount <= 4 ? 'Waves spreading load nicely.' :
                      config.waveCount > 5 ? 'Too many waves stresses systems.' : undefined} />
            <RiskMeter label="Fairness Projection" value={projections.fairnessEstimate} thresholds={{ low: 45, high: 70 }} inverted
                flashClass={flash['Fairness Projection']}
                hint={projections.fairnessEstimate >= 70 ? 'Strong fairness controls in place.' :
                      projections.fairnessEstimate < 45 ? 'Fairness controls insufficient.' : undefined} />
            <RiskMeter label="Presale Pressure" value={projections.presalePressure} thresholds={{ low: 30, high: 65 }}
                flashClass={flash['Presale Pressure']}
                hint={config.presalePercent > 35 ? 'Presale is squeezing the public pool.' : undefined} />
            <RiskMeter label="Accessibility Coverage" value={projections.accessCoverage} thresholds={{ low: 25, high: 55 }} inverted
                flashClass={flash['Accessibility Coverage']}
                hint={config.accessiblePercent <= 2 ? 'Coverage very thin.' : undefined} />

            <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Inventory Split</div>
                <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Public Pool</span>
                    <span className="font-mono text-cyan-400">{projections.publicInventory.toLocaleString()} ({projections.publicPercent}%)</span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Presale Reserve</span>
                    <span className="font-mono text-amber-400">{projections.presaleTickets.toLocaleString()} ({config.presalePercent}%)</span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Accessible</span>
                    <span className="font-mono text-green-400">{projections.accessibleTickets.toLocaleString()} ({config.accessiblePercent}%)</span>
                </div>
            </div>

            <div className="pt-2 border-t border-slate-800">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">Pre-Launch Alerts</div>
                <AlertsPanel />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen grid-bg pb-32 lg:pb-6">
            <div className="sticky top-0 z-30 bg-terminal-bg/95 backdrop-blur border-b border-slate-800 px-3 py-2">
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
                    <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white py-1 px-1 shrink-0">
                        <Icon name="ArrowLeft" className="w-5 h-5" />
                        <span className="text-sm hidden sm:inline">Back</span>
                    </button>
                    <div className="text-center min-w-0 flex-1">
                        <h2 className="text-sm md:text-base font-bold text-white truncate">{level.name}</h2>
                        <p className="text-[10px] text-slate-500">Configure before doors open</p>
                    </div>
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-white py-1 px-2 rounded border border-slate-700 hover:border-slate-500"
                    >
                        <Icon name="Refresh" className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Reset</span>
                    </button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-3 md:p-4">
                <PressureHUD level={level} projections={projections} config={config} />
                <QueueTraffic level={level} projections={projections} config={config} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
                    <div className="lg:col-span-2 space-y-3 md:space-y-4">
                        <ConsolePanel title="Queue Timing" icon="Clock"
                            status={config.waveCount === 1 && level.demand / level.seats > 6 ? 'warning' : 'good'}>
                            <div className="space-y-5">
                                <GameSlider label="Waiting Room Opens" value={config.waitingRoomTime}
                                    onChange={(v) => updateConfig('waitingRoomTime', v)} min={0.5} max={24} step={0.5} unit="h"
                                    helpText="Earlier = fan prep time; bots also get more setup time." />
                                <GameSlider label="Entry Wave Count" value={config.waveCount}
                                    onChange={(v) => updateConfig('waveCount', v)} min={1} max={8}
                                    helpText="Staggered entry spreads load; too many waves causes stress." />
                                {config.waveCount > 1 && (
                                    <GameSlider label="Wave Interval" value={config.waveInterval}
                                        onChange={(v) => updateConfig('waveInterval', v)} min={5} max={60} step={5} unit="m"
                                        helpText="Longer intervals reduce overlap; short intervals test patience." />
                                )}
                            </div>
                        </ConsolePanel>

                        <ConsolePanel title="Identity & Bot Defense" icon="Shield"
                            status={config.botDetection === 'low' && level.botPressure > 0.3 ? 'danger' :
                                    config.botDetection === 'aggressive' ? 'warning' : 'good'}>
                            <div className="space-y-4">
                                <SegmentedControl label="Bot Detection" options={BOT_DETECTION_OPTIONS}
                                    value={config.botDetection} onChange={(v) => updateConfig('botDetection', v)} />
                                <SegmentedControl label="Fan Verification" options={VERIFICATION_OPTIONS}
                                    value={config.verification} onChange={(v) => updateConfig('verification', v)} />
                            </div>
                        </ConsolePanel>

                        <ConsolePanel title="Purchase Rules" icon="Ticket">
                            <div className="space-y-5">
                                <GameSlider label="Purchase Limit" value={config.purchaseLimit}
                                    onChange={(v) => updateConfig('purchaseLimit', v)} min={1} max={8} unit=" tix"
                                    helpText="Lower = wider distribution; higher = group-friendly." />
                                <SegmentedControl label="Resale Policy" options={RESALE_OPTIONS} columns={4}
                                    value={config.resale} onChange={(v) => updateConfig('resale', v)} />
                            </div>
                        </ConsolePanel>

                        <ConsolePanel title="Inventory Allocation" icon="Layers">
                            <div className="space-y-5">
                                <GameSlider label="VIP / Presale Reserve" value={config.presalePercent}
                                    onChange={(v) => updateConfig('presalePercent', v)} min={0} max={50} unit="%"
                                    helpText="Presale reduces public chaos; large reserves alienate general fans." />
                                <GameSlider label="Accessible Priority" value={config.accessiblePercent}
                                    onChange={(v) => updateConfig('accessiblePercent', v)} min={1} max={15} unit="%"
                                    helpText="Reserved accessible inventory ensures fair access." />
                            </div>
                        </ConsolePanel>
                    </div>

                    <div className="hidden lg:block space-y-3">
                        <div style={{ position: 'sticky', top: '64px' }}>
                            <ConsolePanel title="Live Projections" icon="Activity">
                                <ProjectionsContent />
                            </ConsolePanel>
                            <button
                                onClick={() => onRunSimulation(config)}
                                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-4 bg-green-500 hover:bg-green-400 font-bold text-base rounded transition-all glow-green"
                                style={{ color: '#0a0e14' }}
                            >
                                <Icon name="Zap" className="w-5 h-5" />
                                <span>Launch Onsale</span>
                            </button>
                            <p className="text-[10px] text-slate-500 text-center mt-2">Simulation runs with current settings</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile bottom drawer */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-terminal-bg border-t-2 border-cyan-500/30">
                {projPanelOpen && (
                    <div className="max-h-[65vh] overflow-y-auto p-3 border-b border-slate-800">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">Live Projections</span>
                            <button onClick={() => setProjPanelOpen(false)} className="text-slate-400 p-1" aria-label="Close projections">
                                <Icon name="X" className="w-4 h-4" />
                            </button>
                        </div>
                        <ProjectionsContent />
                    </div>
                )}
                <div className="p-3 flex gap-2">
                    <button
                        onClick={() => setProjPanelOpen(p => !p)}
                        className="flex items-center justify-center gap-1.5 px-3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm rounded border border-slate-700"
                    >
                        <Icon name="Activity" className="w-4 h-4" />
                        <span>Projections</span>
                        {projections.warnings.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 rounded font-bold" style={{ color: '#0a0e14' }}>
                                {projections.warnings.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => onRunSimulation(config)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-400 font-bold text-sm rounded glow-green"
                        style={{ color: '#0a0e14' }}
                    >
                        <Icon name="Zap" className="w-4 h-4" />
                        <span>Launch Onsale</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
