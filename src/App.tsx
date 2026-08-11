import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { LEVELS } from './data/levels';
import { runSimulation } from './game/simulation';
import { applyScenario } from './game/scenario';
import { playSound } from './game/audio';
import type {
    Level, LevelId, GameConfig, SimulationResult, BestScores, ScreenState,
    RecordsStore, RecordImprovements, EndlessRunResult, EndlessImprovements,
} from './game/types';
import {
    loadRecords, saveRecords, resetRecords, applyResult, bestScoresFromStore,
    deriveCampaignStatus, applyEndlessResult, markTrainingComplete, markTrainingSeen,
    applyDailyResult, effectiveDailyStreak,
} from './game/records';
import { generateDailyChallenge, type DailyChallenge } from './game/daily';
import { localDateKey } from './game/dateUtils';
import { getRank } from './game/ranks';
import { track } from './game/analytics';
import { isDebugEnabled } from './game/devtools';
// Dev-only debug panel. The dynamic import lives inside a DEV-only branch, so in
// production `import.meta.env.DEV` folds to false, this becomes `null`, and Rollup
// drops both the branch AND the DebugPanel chunk from the shipped build entirely.
const DebugPanel = import.meta.env.DEV
    ? lazy(() => import('./components/DebugPanel').then(m => ({ default: m.DebugPanel })))
    : null;
import { TitleScreen } from './screens/TitleScreen';
import { LevelSelectScreen } from './screens/LevelSelectScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { BriefingScreen } from './screens/BriefingScreen';
import { ConfigurationScreen } from './screens/ConfigurationScreen';
import { SimulationScreen } from './screens/SimulationScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { CampaignCompleteScreen } from './screens/CampaignCompleteScreen';
import { EndlessBriefingScreen } from './screens/EndlessBriefingScreen';
import { EndlessShiftScreen } from './screens/EndlessShiftScreen';
import { EndlessReportScreen } from './screens/EndlessReportScreen';

const PAR_SCORES = LEVELS.reduce((acc, l) => { acc[l.id] = l.parScore; return acc; }, {} as Record<LevelId, number>);

export function App() {
    const [screen, setScreen] = useState<ScreenState>('title');
    const [currentLevel, setCurrentLevel] = useState<Level | null>(null);
    const [records, setRecords] = useState<RecordsStore>(() => loadRecords());
    const [results, setResults] = useState<SimulationResult | null>(null);
    const [improvements, setImprovements] = useState<RecordImprovements | null>(null);
    const [pendingConfig, setPendingConfig] = useState<GameConfig | null>(null);
    // Result computed at launch time — drives the anticipation sequence, then is
    // applied to records when the sequence completes.
    const [pendingResults, setPendingResults] = useState<SimulationResult | null>(null);
    const [lastConfig, setLastConfig] = useState<GameConfig | null>(null);
    const [endlessResult, setEndlessResult] = useState<EndlessRunResult | null>(null);
    const [endlessImprovements, setEndlessImprovements] = useState<EndlessImprovements | null>(null);
    // Daily Challenge: the challenge being played (null = campaign flow) and the
    // outcome flags of the most recent daily run (for the results screen).
    const [activeDaily, setActiveDaily] = useState<DailyChallenge | null>(null);
    const [dailyRunFlags, setDailyRunFlags] = useState<{ newDailyBest: boolean } | null>(null);

    // Persist records whenever they change.
    useEffect(() => {
        saveRecords(records);
    }, [records]);

    // One analytics event on load (no-op sink by default; see game/analytics.ts).
    useEffect(() => {
        track('app_started', { trainingComplete: records.trainingComplete === true }, Date.now());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Best scores derived from records drive unlock restoration.
    const bestScores: BestScores = useMemo(() => bestScoresFromStore(records), [records]);

    // Today's deterministic challenge. localDateKey() is read every render so the
    // Mission Board rolls over at local midnight without a reload; the useMemo
    // keeps generation (which runs the candidate-config solver) to once per day.
    const todayKey = localDateKey();
    const todaysChallenge = useMemo(() => generateDailyChallenge(todayKey), [todayKey]);

    const handleSelectLevel = useCallback((level: Level) => {
        track('mission_started', { levelId: level.id, name: level.name }, Date.now());
        setActiveDaily(null);
        setCurrentLevel(level);
        setLastConfig(null);
        setScreen('briefing');
    }, []);

    const handleStartDaily = useCallback(() => {
        track('mission_started', { daily: true, dateKey: todaysChallenge.dateKey, venue: todaysChallenge.venueName }, Date.now());
        setActiveDaily(todaysChallenge);
        setCurrentLevel(todaysChallenge.level);
        setLastConfig(null);
        setScreen('briefing');
    }, [todaysChallenge]);

    const handleRunSimulation = useCallback((config: GameConfig) => {
        if (!currentLevel) return;
        // Compute the deterministic result NOW so the launch anticipation sequence
        // can visualize the actual run (bot leakage, load, checkout health) without
        // ever running a second simulation. Records are applied only at reveal.
        // Daily levels carry a descriptive-only scenario, so applyScenario is
        // identity there; the pre-baked level params ARE what gets simulated.
        const effectiveLevel = applyScenario(currentLevel);
        setPendingResults(runSimulation(effectiveLevel, config));
        setPendingConfig(config);
        setScreen('simulating');
    }, [currentLevel]);

    const handleSimulationComplete = useCallback(() => {
        if (!currentLevel || !pendingConfig || !pendingResults) return;
        const simResults = pendingResults;
        setResults(simResults);
        setLastConfig(pendingConfig);

        const rank = getRank(simResults.overallScore, currentLevel.parScore);

        if (activeDaily) {
            // Daily Challenge run: record ONLY into the daily record — never into
            // campaign mission records (the daily level reuses campaign level ids).
            setRecords(prev => {
                const { store, newDailyBest, firstClearToday } = applyDailyResult(
                    prev, activeDaily.dateKey, simResults, activeDaily.targetScore, Date.now(),
                );
                setDailyRunFlags({ newDailyBest });
                const now = Date.now();
                const common = { daily: true, dateKey: activeDaily.dateKey, score: simResults.overallScore, rank: rank.label };
                if (simResults.passed) track('mission_completed', common, now);
                else track('mission_failed', common, now);
                if (firstClearToday) track('record_broken', { ...common, kind: 'daily_first_clear' }, now);
                return store;
            });
            setImprovements(null);
        } else {
            setRecords(prev => {
                const { store, improvements: imp } = applyResult(prev, currentLevel, simResults, Date.now());
                setImprovements(imp);

                // Analytics — derive from the record delta so events reflect true firsts.
                const now = Date.now();
                const common = { levelId: currentLevel.id, score: simResults.overallScore, rank: rank.label };
                if (simResults.passed) track('mission_completed', common, now);
                else track('mission_failed', common, now);
                if (imp.newlyMastered) track('mastery_earned', common, now);
                if (imp.anyImprovement) track('record_broken', common, now);

                return store;
            });
            setDailyRunFlags(null);
        }

        // Outcome sound hooks (no-op sink today).
        if (rank.tier === 4) playSound('mastered');
        else if (rank.tier === 3) playSound('strong_clear');
        else if (simResults.passed) playSound('pass');
        else playSound('fail');

        setScreen('results');
    }, [currentLevel, pendingConfig, pendingResults, activeDaily]);

    const handleNextLevel = useCallback(() => {
        if (!currentLevel) return;
        const idx = LEVELS.findIndex(l => l.id === currentLevel.id);
        if (idx < LEVELS.length - 1) {
            setCurrentLevel(LEVELS[idx + 1]);
            setLastConfig(null);
            setScreen('briefing');
        }
    }, [currentLevel]);

    const hasNextLevel = useMemo(() => {
        if (!currentLevel) return false;
        const idx = LEVELS.findIndex(l => l.id === currentLevel.id);
        return idx < LEVELS.length - 1;
    }, [currentLevel]);

    const campaign = useMemo(() => deriveCampaignStatus(records, PAR_SCORES), [records]);

    // Whether *this* run completed the campaign (all 5 cleared) on the final mission.
    const isFinalMission = currentLevel?.id === LEVELS[LEVELS.length - 1].id;
    const canFinishCampaign = isFinalMission && (results?.passed ?? false) && campaign.complete;

    const handleResetRecords = useCallback(() => {
        track('records_reset', {}, Date.now());
        setRecords(resetRecords());
    }, []);

    // --- Training Shift ---
    // First-time players (no history, prompt unseen) are routed into training from
    // the title; everyone else goes straight to the Mission Board. Either way we
    // record that the prompt was seen so it never auto-fires again.
    const handleEnterFromTitle = useCallback(() => {
        setRecords(prev => {
            if (prev.trainingSeen || prev.trainingComplete
                || prev.global.totalSimulations > 0 || (prev.endless?.runs ?? 0) > 0) {
                setScreen('levelSelect');
                return prev;
            }
            // Brand-new player → offer training. Mark the prompt as seen now.
            setScreen('training');
            return markTrainingSeen(prev);
        });
    }, []);

    const handleTrainingComplete = useCallback(() => {
        track('training_completed', {}, Date.now());
        setRecords(prev => markTrainingComplete(prev));
        setScreen('levelSelect');
    }, []);

    const handleStartTraining = useCallback(() => {
        track('training_started', {}, Date.now());
        playSound('queue_open');
        setScreen('training');
    }, []);

    // --- Endless Shift ---
    const handleStartEndless = useCallback(() => {
        track('endless_started', {}, Date.now());
        playSound('queue_open');
        setScreen('endlessBriefing');
    }, []);

    // --- Developer debug panel ---
    // Double-gated: only in DEV builds (import.meta.env.DEV is statically false in
    // production, so this whole branch + the DebugPanel import tree-shake out of the
    // shipped bundle) AND behind the ?debug=1 / localStorage flag while developing.
    const debugEnabled = useMemo(() => import.meta.env.DEV && isDebugEnabled(), []);
    const handleDebugJumpToMission = useCallback((levelId: LevelId) => {
        const lvl = LEVELS.find(l => l.id === levelId);
        if (lvl) { setActiveDaily(null); setCurrentLevel(lvl); setLastConfig(null); setScreen('briefing'); }
    }, []);

    const handleEndlessComplete = useCallback((result: EndlessRunResult) => {
        track('endless_ended', {
            timeSurvived: result.timeSurvived, score: result.operatorScore,
            wavesReached: result.wavesReached, endReason: result.endReason,
            decisionsTaken: result.decisionsCorrect + result.decisionsWrong,
            decisionsIgnored: result.decisionsIgnored,
        }, Date.now());
        setEndlessResult(result);
        setRecords(prev => {
            const { store, improvements: imp } = applyEndlessResult(prev, result, Date.now());
            setEndlessImprovements(imp);
            return store;
        });
        setScreen('endlessReport');
    }, []);

    return (
        <div className="min-h-screen bg-terminal-bg">
            {screen === 'title' && <TitleScreen onStart={handleEnterFromTitle} />}
            {screen === 'training' && (
                <TrainingScreen
                    onComplete={handleTrainingComplete}
                    onSkip={() => { track('training_skipped', {}, Date.now()); setRecords(prev => markTrainingSeen(prev)); setScreen('levelSelect'); }}
                />
            )}
            {screen === 'levelSelect' && (
                <LevelSelectScreen
                    levels={LEVELS}
                    bestScores={bestScores}
                    records={records}
                    campaign={campaign}
                    daily={todaysChallenge}
                    onSelectLevel={handleSelectLevel}
                    onStartDaily={handleStartDaily}
                    onStartEndless={handleStartEndless}
                    onStartTraining={handleStartTraining}
                    onBack={() => setScreen('title')}
                    onResetRecords={handleResetRecords}
                />
            )}
            {screen === 'briefing' && currentLevel && (
                <BriefingScreen
                    level={currentLevel}
                    dailyDateKey={activeDaily?.dateKey}
                    onContinue={() => setScreen('config')}
                    onBack={() => setScreen('levelSelect')}
                />
            )}
            {screen === 'config' && currentLevel && (
                <ConfigurationScreen
                    level={currentLevel}
                    initialConfig={lastConfig}
                    onRunSimulation={handleRunSimulation}
                    onBack={() => setScreen('briefing')}
                />
            )}
            {screen === 'simulating' && currentLevel && pendingConfig && pendingResults && (
                <SimulationScreen level={currentLevel} config={pendingConfig} results={pendingResults} onComplete={handleSimulationComplete} />
            )}
            {screen === 'results' && currentLevel && results && (
                <ResultsScreen
                    level={currentLevel}
                    results={results}
                    record={activeDaily ? undefined : records.missions[currentLevel.id]}
                    improvements={improvements}
                    daily={activeDaily ? {
                        dateKey: activeDaily.dateKey,
                        venueName: activeDaily.venueName,
                        bestScoreToday: records.daily?.dateKey === activeDaily.dateKey ? records.daily.bestScoreToday : 0,
                        newDailyBest: dailyRunFlags?.newDailyBest ?? false,
                        completedToday: records.daily?.dateKey === activeDaily.dateKey ? records.daily.completedToday : false,
                        streak: effectiveDailyStreak(records.daily, activeDaily.dateKey),
                        attemptsToday: records.daily?.dateKey === activeDaily.dateKey ? records.daily.attemptsToday : 0,
                        onReplayToday: () => setScreen('config'),
                    } : undefined}
                    onAdjust={() => setScreen('config')}
                    onResetTry={() => { setLastConfig(null); setScreen('config'); }}
                    onNextLevel={handleNextLevel}
                    onLevelSelect={() => setScreen('levelSelect')}
                    hasNextLevel={activeDaily ? false : hasNextLevel}
                    campaignComplete={activeDaily ? false : canFinishCampaign}
                    onViewCampaign={() => { track('campaign_completed', { highestScore: campaign.highestScore, mastered: campaign.missionsMastered, operatorRank: campaign.operatorRank }, Date.now()); setScreen('campaignComplete'); }}
                />
            )}
            {screen === 'campaignComplete' && (
                <CampaignCompleteScreen
                    campaign={campaign}
                    onReplay={() => { setCurrentLevel(LEVELS[0]); setLastConfig(null); setScreen('briefing'); }}
                    onContinue={() => setScreen('levelSelect')}
                />
            )}
            {screen === 'endlessBriefing' && (
                <EndlessBriefingScreen
                    endless={records.endless}
                    onStart={() => setScreen('endlessShift')}
                    onBack={() => setScreen('levelSelect')}
                />
            )}
            {screen === 'endlessShift' && (
                <EndlessShiftScreen
                    onEnd={handleEndlessComplete}
                    onQuit={() => setScreen('levelSelect')}
                />
            )}
            {screen === 'endlessReport' && endlessResult && (
                <EndlessReportScreen
                    result={endlessResult}
                    record={records.endless}
                    improvements={endlessImprovements}
                    onRetry={() => setScreen('endlessShift')}
                    onExit={() => setScreen('levelSelect')}
                />
            )}

            {debugEnabled && DebugPanel && (
                <Suspense fallback={null}>
                    <DebugPanel
                        levels={LEVELS}
                        records={records}
                        screen={screen}
                        onApplyStore={(store) => setRecords(store)}
                        onJumpToMission={handleDebugJumpToMission}
                        onGoEndless={() => setScreen('endlessBriefing')}
                        onResetRecords={handleResetRecords}
                    />
                </Suspense>
            )}
        </div>
    );
}
