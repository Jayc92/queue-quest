import type { CampaignStatus, IconName } from '../game/types';
import { Icon } from '../components/ui/Icon';
import { useCountUp } from '../components/ui/useCountUp';

interface Props {
    campaign: CampaignStatus;
    onReplay: () => void;
    onContinue: () => void;
}

function StatValue({ raw, suffix = '', delayMs = 0 }: { raw: number; suffix?: string; delayMs?: number }) {
    const n = useCountUp(raw, 800, delayMs);
    return <>{n}{suffix}</>;
}

export function CampaignCompleteScreen({ campaign, onReplay, onContinue }: Props) {
    const stats: { label: string; raw: number; suffix?: string; icon: IconName }[] = [
        { label: 'Highest Score', raw: campaign.highestScore, icon: 'Star' },
        { label: 'Strong Clears', raw: campaign.strongClears, suffix: '/5', icon: 'Zap' },
        { label: 'Mastered', raw: campaign.missionsMastered, suffix: '/5', icon: 'Trophy' },
        { label: 'Total Runs', raw: campaign.totalRuns, icon: 'Activity' },
    ];

    return (
        <div className="min-h-screen grid-bg flex items-center justify-center p-4 md:p-6">
            <div className="max-w-2xl w-full">
                {/* Header banner — system-online activation with a gold light sweep */}
                <div className="panel overflow-hidden mb-4 border-amber-400/50 glow-gold animate-reward-glow animate-system-online relative">
                    <div className="p-6 md:p-8 text-center bg-amber-400/10 relative overflow-hidden">
                        {/* Gold sweep highlight */}
                        <div
                            className="absolute inset-y-0 w-1/3 pointer-events-none animate-gold-sweep"
                            style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.18), transparent)' }}
                        />
                        <div className="flex justify-center mb-3 relative">
                            <div className="relative w-16 h-16">
                                {/* Rotating conic halo behind the trophy */}
                                <div
                                    className="absolute -inset-2 rounded-full animate-halo opacity-60"
                                    style={{ background: 'conic-gradient(from 0deg, transparent, rgba(251,191,36,0.5), transparent, rgba(251,191,36,0.3), transparent)' }}
                                />
                                <div className="absolute inset-0 rounded-full border-2 border-amber-300 bg-amber-400/20 flex items-center justify-center text-amber-300 animate-medal">
                                    <Icon name="Trophy" className="w-8 h-8" />
                                </div>
                            </div>
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-amber-300 mb-1">Command Center Online</div>
                        <h1 className="text-2xl md:text-3xl font-black text-white mb-1">All Operations Cleared</h1>
                        <p className="text-sm text-slate-300">
                            Operator Rank: <span className="font-mono font-bold text-amber-300">{campaign.operatorRank}</span>
                        </p>
                    </div>
                </div>

                {/* Stats grid — count up, staggered */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    {stats.map((s, i) => (
                        <div key={i} className="panel p-3 text-center animate-count-rise" style={{ animationDelay: `${150 + i * 80}ms` }}>
                            <span className="text-cyan-400 mx-auto mb-1 block"><Icon name={s.icon} className="w-4 h-4" /></span>
                            <div className="text-2xl font-mono font-bold text-white tabular-nums leading-none">
                                <StatValue raw={s.raw} suffix={s.suffix} delayMs={300 + i * 80} />
                            </div>
                            <div className="text-[9px] font-mono uppercase tracking-wide text-slate-500 mt-1">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Overall rating */}
                <div className="panel p-4 mb-4 border-l-2 border-l-cyan-500 animate-count-rise" style={{ animationDelay: '500ms' }}>
                    <div className="flex items-start gap-3">
                        <span className="text-cyan-400 shrink-0 mt-0.5"><Icon name="Target" className="w-4 h-4" /></span>
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 mb-0.5">Overall Rating</div>
                            <p className="text-sm text-white">{campaign.overallRating}</p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 animate-fade-in-up" style={{ animationDelay: '650ms' }}>
                    <button
                        onClick={onReplay}
                        className="qq-press flex items-center justify-center gap-2 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 font-bold text-sm rounded transition-all glow-cyan"
                        style={{ color: '#0a0e14' }}
                    >
                        <Icon name="Refresh" className="w-4 h-4" />
                        <span>Replay Campaign</span>
                    </button>
                    <button
                        onClick={onContinue}
                        className="qq-press flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-sm transition-all border border-slate-700"
                    >
                        <Icon name="Layers" className="w-4 h-4" />
                        <span>Continue Improving Records</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
