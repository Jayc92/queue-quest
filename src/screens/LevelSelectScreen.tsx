import type { Level, BestScores } from '../game/types';
import { getRank, formatNumber } from '../game/ranks';
import { Icon } from '../components/ui/Icon';

interface Props {
    levels: Level[];
    bestScores: BestScores;
    onSelectLevel: (level: Level) => void;
    onBack: () => void;
}

export function LevelSelectScreen({ levels, bestScores, onSelectLevel, onBack }: Props) {
    return (
        <div className="min-h-screen grid-bg p-3 md:p-6">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-5">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors py-2 px-1">
                        <Icon name="ArrowLeft" className="w-5 h-5" />
                        <span className="text-sm">Exit</span>
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg md:text-xl font-bold text-white">Mission Board</h2>
                        <p className="text-xs text-slate-500">Select your assignment</p>
                    </div>
                    <div className="w-12" />
                </div>

                <div className="space-y-3">
                    {levels.map((level, index) => {
                        const prevLevel = levels[index - 1];
                        const isUnlocked =
                            index === 0 ||
                            (prevLevel && bestScores[prevLevel.id] !== undefined && (bestScores[prevLevel.id] as number) >= prevLevel.parScore);
                        const bestScore = bestScores[level.id];
                        const rank = bestScore !== undefined ? getRank(bestScore, level.parScore) : null;
                        const mastered = rank && rank.tier === 4;

                        return (
                            <button
                                key={level.id}
                                onClick={() => isUnlocked && onSelectLevel(level)}
                                disabled={!isUnlocked}
                                aria-disabled={!isUnlocked}
                                className={`w-full text-left transition-all ${
                                    isUnlocked
                                        ? 'panel hover:border-cyan-500/50 cursor-pointer'
                                        : 'panel opacity-40 cursor-not-allowed'
                                }`}
                            >
                                <div className="p-4">
                                    <div className="flex items-start gap-3">
                                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                                            isUnlocked
                                                ? mastered ? 'bg-amber-400/20 text-amber-300' :
                                                  rank && rank.tier >= 2 ? 'bg-green-500/20 text-green-400' :
                                                  'bg-cyan-500/20 text-cyan-400'
                                                : 'bg-slate-800 text-slate-600'
                                        }`}>
                                            <Icon name={isUnlocked ? level.icon : 'Lock'} className="w-6 h-6" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                <span className="text-[10px] font-mono text-slate-500">LVL {level.id}</span>
                                                <h3 className="font-bold text-white text-base">{level.name}</h3>
                                                {rank && rank.tier >= 2 && (
                                                    <span className={`px-1.5 py-0.5 text-[10px] rounded font-mono ${
                                                        rank.color === 'gold' ? 'bg-amber-400/20 text-amber-300' :
                                                        rank.color === 'cyan' ? 'bg-cyan-500/20 text-cyan-400' :
                                                        'bg-green-500/20 text-green-400'
                                                    }`}>{rank.label}</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mb-2">
                                                {level.subtitle} · <span className="text-slate-400">{level.threatProfile}</span>
                                            </p>

                                            <div className="grid grid-cols-4 gap-2 text-xs">
                                                <div className="flex items-center gap-1">
                                                    <Icon name="Ticket" className="w-3.5 h-3.5" />
                                                    <span className="text-slate-400 font-mono">{formatNumber(level.seats)}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Icon name="Users" className="w-3.5 h-3.5" />
                                                    <span className="text-slate-400 font-mono">{formatNumber(level.demand)}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Icon name="Bot" className="w-3.5 h-3.5" />
                                                    <span className={`font-mono ${level.botPressure > 0.5 ? 'text-red-400' : level.botPressure > 0.3 ? 'text-amber-400' : 'text-green-400'}`}>
                                                        {Math.round(level.botPressure * 100)}%
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Icon name="Target" className="w-3.5 h-3.5" />
                                                    <span className="text-cyan-400 font-bold font-mono">{level.parScore}</span>
                                                </div>
                                            </div>

                                            {!isUnlocked && (
                                                <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
                                                    <Icon name="Lock" className="w-3 h-3" />
                                                    <span>Clear previous mission to unlock.</span>
                                                </div>
                                            )}
                                        </div>

                                        {bestScore !== undefined && (
                                            <div className={`text-right shrink-0 ${
                                                rank && rank.tier >= 2
                                                    ? rank.color === 'gold' ? 'text-amber-300' : rank.color === 'cyan' ? 'text-cyan-400' : 'text-green-400'
                                                    : 'text-slate-400'
                                            }`}>
                                                <div className="text-2xl font-mono font-bold tabular-nums">{bestScore}</div>
                                                <div className="text-[10px] opacity-60 font-mono">BEST / {level.parScore}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
