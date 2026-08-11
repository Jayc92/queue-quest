import { useState } from 'react';
import type { Level, BestScores, RecordsStore, ThreatLevel, CampaignStatus } from '../game/types';
import type { DailyChallenge } from '../game/daily';
import { getRank, formatNumber } from '../game/ranks';
import { nextGoal, deriveOperatorSummary, operationalAccuracy, effectiveDailyStreak } from '../game/records';
import { formatDuration as fmtShift } from '../game/format';
import { Icon } from '../components/ui/Icon';
import { ScreenTour } from '../components/tour/ScreenTour';
import { MISSION_BOARD_TOUR } from '../data/tours';

function threatChipClass(threat: ThreatLevel): string {
    switch (threat) {
        case 'Low': return 'border-green-500/40 bg-green-500/10 text-green-400';
        case 'Moderate': return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400';
        case 'High': return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
        case 'Severe': return 'border-red-500/40 bg-red-500/10 text-red-400';
        case 'Critical': return 'border-red-500/50 bg-red-500/20 text-red-300';
    }
}

interface Props {
    levels: Level[];
    bestScores: BestScores;
    records: RecordsStore;
    campaign: CampaignStatus;
    daily: DailyChallenge;
    onSelectLevel: (level: Level) => void;
    onStartDaily: () => void;
    onStartEndless: () => void;
    onStartTraining: () => void;
    onBack: () => void;
    onResetRecords: () => void;
}

function formatLastPlayed(ts: number): string {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return 'A while ago';
}

function OperatorRecord({ records }: { records: RecordsStore }) {
    const summary = deriveOperatorSummary(records);
    const accuracy = operationalAccuracy(records.endless);
    const stats = [
        { label: 'Highest Score', value: summary.highestScore || '—', icon: 'Star' as const },
        { label: 'Cleared', value: `${summary.missionsCleared}/5`, icon: 'Check' as const },
        { label: 'Mastered', value: `${summary.missionsMastered}/5`, icon: 'Trophy' as const },
        { label: 'Total Runs', value: summary.totalRuns, icon: 'Activity' as const },
    ];
    return (
        <div className="panel p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Operator Record</span>
                <span className="text-[10px] font-mono text-slate-600">Last: {formatLastPlayed(summary.lastPlayed)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
                {stats.map((s, i) => (
                    <div key={i} className="flex flex-col items-center text-center gap-0.5 py-1">
                        <span className="text-cyan-400"><Icon name={s.icon} className="w-3.5 h-3.5" /></span>
                        <span className="text-lg font-mono font-bold text-white tabular-nums leading-none">{s.value}</span>
                        <span className="text-[9px] font-mono uppercase tracking-wide text-slate-500">{s.label}</span>
                    </div>
                ))}
            </div>
            {accuracy !== null && (
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <span className="text-amber-400"><Icon name="Target" className="w-3.5 h-3.5" /></span>
                        Operational Accuracy
                    </span>
                    <span className={`text-sm font-mono font-bold tabular-nums ${accuracy >= 66 ? 'text-green-400' : accuracy >= 33 ? 'text-amber-400' : 'text-red-400'}`}>
                        {accuracy}%
                    </span>
                </div>
            )}
        </div>
    );
}

export function LevelSelectScreen({ levels, bestScores, records, campaign, daily, onSelectLevel, onStartDaily, onStartEndless, onStartTraining, onBack, onResetRecords }: Props) {
    const [confirmReset, setConfirmReset] = useState(false);
    const hasAnyRecords = records.global.totalSimulations > 0 || (records.endless?.runs ?? 0) > 0;
    const endless = records.endless;
    const trainingDone = records.trainingComplete === true;

    // Daily card state: the stored "today" fields describe records.daily.dateKey —
    // only trust them when that key IS today's challenge (they roll over on play).
    const dailyRec = records.daily;
    const dailyIsToday = dailyRec?.dateKey === daily.dateKey;
    const dailyCompleted = dailyIsToday && dailyRec!.completedToday;
    const dailyBest = dailyIsToday ? dailyRec!.bestScoreToday : 0;
    const dailyStreak = effectiveDailyStreak(dailyRec, daily.dateKey);

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

                <div data-tour="board-record">
                    <OperatorRecord records={records} />
                </div>

                {/* Training Shift — optional guided onboarding. Recommended (and
                    subtly highlighted) until completed; a quiet replay entry after. */}
                <button
                    onClick={onStartTraining}
                    data-tour="board-training"
                    className={`w-full text-left panel qq-lift cursor-pointer mb-3 border ${
                        trainingDone ? 'border-slate-700 hover:border-cyan-500/50' : 'border-cyan-500/50 animate-objective'
                    }`}
                >
                    <div className="p-3 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${trainingDone ? 'bg-slate-800 text-slate-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                            <Icon name={trainingDone ? 'Refresh' : 'Play'} className="w-5 h-5" fill={trainingDone ? 'none' : 'currentColor'} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-white text-sm">Training Shift</h3>
                                {trainingDone ? (
                                    <span className="px-1.5 py-0.5 text-[9px] rounded font-mono bg-green-500/20 text-green-400 flex items-center gap-1">
                                        <Icon name="Check" className="w-3 h-3" /> DONE
                                    </span>
                                ) : (
                                    <span className="px-1.5 py-0.5 text-[9px] rounded font-mono bg-cyan-500/20 text-cyan-400">RECOMMENDED</span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                {trainingDone ? 'Replay the guided walkthrough anytime.' : 'Learn the console in 2 minutes — optional, no stakes.'}
                            </p>
                        </div>
                        <Icon name="ArrowRight" className="w-4 h-4 text-slate-500 shrink-0" />
                    </div>
                </button>

                {/* Daily Challenge — a fresh deterministic fictional onsale every local
                    calendar day. Available immediately; no campaign progress required. */}
                <button
                    onClick={onStartDaily}
                    data-tour="board-daily"
                    className={`w-full text-left panel qq-lift cursor-pointer mb-3 border ${
                        dailyCompleted ? 'border-green-500/40 hover:border-green-400/60' : 'border-amber-500/40 hover:border-amber-400/70'
                    }`}
                >
                    <div className="p-3">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${dailyCompleted ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                <Icon name={dailyCompleted ? 'Check' : 'Zap'} className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-bold text-white text-sm">Daily Challenge</h3>
                                    {dailyCompleted ? (
                                        <span className="px-1.5 py-0.5 text-[9px] rounded font-mono bg-green-500/20 text-green-400 flex items-center gap-1">
                                            <Icon name="Check" className="w-3 h-3" /> CLEARED TODAY
                                        </span>
                                    ) : (
                                        <span className="px-1.5 py-0.5 text-[9px] rounded font-mono bg-amber-500/15 text-amber-400">NEW EVERY DAY</span>
                                    )}
                                    {dailyStreak > 0 && (
                                        <span className="px-1.5 py-0.5 text-[9px] rounded font-mono bg-cyan-500/20 text-cyan-400" title="Daily streak">
                                            STREAK {dailyStreak}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                    {daily.title}
                                </p>
                                <div className="grid grid-cols-4 gap-2 text-xs mt-1.5">
                                    <div className="flex items-center gap-1" title="Capacity">
                                        <Icon name="Ticket" className="w-3.5 h-3.5" />
                                        <span className="text-slate-400 font-mono">{formatNumber(daily.capacity)}</span>
                                    </div>
                                    <div className="flex items-center gap-1" title="Expected demand">
                                        <Icon name="Users" className="w-3.5 h-3.5" />
                                        <span className="text-slate-400 font-mono">{formatNumber(daily.demand)}</span>
                                    </div>
                                    <div className="flex items-center gap-1 min-w-0" title="Primary threat">
                                        <Icon name="Alert" className="w-3.5 h-3.5 shrink-0" />
                                        <span className="text-slate-400 font-mono truncate text-[10px]">{daily.level.identity.primaryConcern}</span>
                                    </div>
                                    <div className="flex items-center gap-1" title="Target score">
                                        <Icon name="Target" className="w-3.5 h-3.5" />
                                        <span className="text-amber-400 font-bold font-mono">{daily.targetScore}</span>
                                    </div>
                                </div>
                            </div>
                            {dailyBest > 0 && (
                                <div className={`text-right shrink-0 ${dailyCompleted ? 'text-green-400' : 'text-slate-400'}`}>
                                    <div className="text-2xl font-mono font-bold tabular-nums">{dailyBest}</div>
                                    <div className="text-[10px] opacity-60 font-mono">TODAY / {daily.targetScore}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </button>

                <div className="space-y-3" data-tour="board-missions">
                    {(() => {
                        // The "current objective" is the first unlocked mission not yet cleared.
                        const objectiveIndex = levels.findIndex((lvl, i) => {
                            const prev = levels[i - 1];
                            const unlocked = i === 0 || (prev && bestScores[prev.id] !== undefined && (bestScores[prev.id] as number) >= prev.parScore);
                            const rec = records.missions[lvl.id];
                            return unlocked && !(rec && rec.clears > 0);
                        });
                        return levels.map((level, index) => {
                        const prevLevel = levels[index - 1];
                        const isUnlocked =
                            index === 0 ||
                            (prevLevel && bestScores[prevLevel.id] !== undefined && (bestScores[prevLevel.id] as number) >= prevLevel.parScore);
                        const record = records.missions[level.id];
                        const bestScore = record && record.attempts > 0 ? record.bestScore : undefined;
                        const rank = bestScore !== undefined ? getRank(bestScore, level.parScore) : null;
                        const mastered = record?.mastered ?? false;
                        const goal = nextGoal(level, record);
                        const isObjective = index === objectiveIndex;

                        return (
                            <button
                                key={level.id}
                                data-tour={index === 0 ? 'board-mission-card' : undefined}
                                onClick={() => isUnlocked && onSelectLevel(level)}
                                disabled={!isUnlocked}
                                aria-disabled={!isUnlocked}
                                className={`w-full text-left transition-all border ${
                                    isUnlocked
                                        ? mastered
                                            ? 'panel qq-lift cursor-pointer border-amber-400/40 hover:border-amber-300/70 glow-gold'
                                            : isObjective
                                                ? 'panel qq-lift cursor-pointer animate-objective'
                                                : 'panel qq-lift cursor-pointer hover:border-cyan-500/50'
                                        : 'panel opacity-40 cursor-not-allowed border-transparent'
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
                                            <p className="text-xs text-slate-500 mb-1.5">
                                                {level.subtitle} · <span className="text-slate-400">{level.identity.missionType}</span>
                                            </p>

                                            {/* Mission personality: threat level + primary concern */}
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide border ${threatChipClass(level.identity.threatLevel)}`}>
                                                    {level.identity.threatLevel} Threat
                                                </span>
                                                <span className="text-[10px] text-slate-500">
                                                    <span className="font-mono uppercase tracking-wide">Concern:</span>{' '}
                                                    <span className="text-slate-300">{level.identity.primaryConcern}</span>
                                                </span>
                                            </div>

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

                                            {/* Next goal — always visible when unlocked */}
                                            {isUnlocked && (
                                                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                                                    <Icon name="Target" className="w-3 h-3 text-cyan-400 shrink-0" />
                                                    <span className="text-[9px] font-mono uppercase tracking-wide text-slate-500 shrink-0">Next</span>
                                                    <span className="text-slate-300 font-medium truncate">{goal.label}</span>
                                                </div>
                                            )}

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
                                                {record && record.attempts > 0 && (
                                                    <div className="text-[9px] font-mono text-slate-500 mt-0.5">{record.attempts} {record.attempts === 1 ? 'run' : 'runs'}</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                        });
                    })()}
                </div>

                {/* Endless Shift — unlocks after the campaign is complete */}
                <div className="mt-4" data-tour="board-endless">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-px flex-1 bg-slate-800" />
                        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Post-Campaign</span>
                        <div className="h-px flex-1 bg-slate-800" />
                    </div>
                    {campaign.complete ? (
                        <button
                            onClick={onStartEndless}
                            className="w-full text-left panel qq-lift cursor-pointer border border-amber-400/40 hover:border-amber-300/70 glow-gold"
                        >
                            <div className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 bg-amber-400/20 text-amber-300">
                                        <Icon name="Activity" className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                            <span className="text-[10px] font-mono text-amber-300/80">ENDLESS</span>
                                            <h3 className="font-bold text-white text-base">Endless Shift</h3>
                                            <span className="px-1.5 py-0.5 text-[10px] rounded font-mono bg-amber-400/20 text-amber-300">UNLOCKED</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-2">Survive escalating pressure · No finish line</p>
                                        {endless && endless.runs > 0 ? (
                                            <div className="grid grid-cols-4 gap-2 text-xs">
                                                <div className="flex items-center gap-1" title="Longest shift">
                                                    <Icon name="Clock" className="w-3.5 h-3.5" />
                                                    <span className="text-slate-400 font-mono">{fmtShift(endless.longestShift)}</span>
                                                </div>
                                                <div className="flex items-center gap-1" title="Highest score">
                                                    <Icon name="Star" className="w-3.5 h-3.5" />
                                                    <span className="text-slate-400 font-mono">{formatNumber(endless.highestScore)}</span>
                                                </div>
                                                <div className="flex items-center gap-1" title="Highest combo">
                                                    <Icon name="Zap" className="w-3.5 h-3.5" />
                                                    <span className="text-slate-400 font-mono">x{endless.highestCombo}</span>
                                                </div>
                                                <div className="flex items-center gap-1" title="Most fans served">
                                                    <Icon name="Users" className="w-3.5 h-3.5" />
                                                    <span className="text-slate-400 font-mono">{formatNumber(endless.mostFansServed)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-[11px] text-amber-300/80">
                                                <Icon name="Play" className="w-3 h-3" fill="currentColor" />
                                                <span>Start your first shift</span>
                                            </div>
                                        )}
                                    </div>
                                    {endless && endless.runs > 0 && (
                                        <div className="text-right shrink-0 text-amber-300">
                                            <div className="text-2xl font-mono font-bold tabular-nums">{fmtShift(endless.longestShift)}</div>
                                            <div className="text-[10px] opacity-60 font-mono">BEST SHIFT</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    ) : (
                        <div className="panel opacity-40 border border-transparent">
                            <div className="p-4 flex items-start gap-3">
                                <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 bg-slate-800 text-slate-600">
                                    <Icon name="Lock" className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[10px] font-mono text-slate-500">ENDLESS</span>
                                        <h3 className="font-bold text-white text-base">Endless Shift</h3>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-2">The long-term operation.</p>
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                        <Icon name="Lock" className="w-3 h-3" />
                                        <span>Clear all five campaign missions to unlock ({campaign.missionsCleared}/5).</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Reset local records */}
                {hasAnyRecords && (
                    <div className="mt-6 flex flex-col items-center gap-2">
                        {!confirmReset ? (
                            <button
                                onClick={() => setConfirmReset(true)}
                                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors py-2 px-3"
                            >
                                <Icon name="Refresh" className="w-3.5 h-3.5" />
                                <span>Reset Local Records</span>
                            </button>
                        ) : (
                            <div className="flex flex-col items-center gap-2 panel p-3 border-red-500/40">
                                <p className="text-xs text-slate-300 text-center">
                                    Erase all local records and stats? This cannot be undone.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { onResetRecords(); setConfirmReset(false); }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 text-xs font-semibold transition-all"
                                    >
                                        <Icon name="Refresh" className="w-3.5 h-3.5" />
                                        <span>Erase Records</span>
                                    </button>
                                    <button
                                        onClick={() => setConfirmReset(false)}
                                        className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ScreenTour tourId="missionBoard" steps={MISSION_BOARD_TOUR} />
        </div>
    );
}
