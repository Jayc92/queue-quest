import { useCallback, useMemo, useState } from 'react';
import { LEVELS } from './data/levels';
import { runSimulation } from './game/simulation';
import type { Level, GameConfig, SimulationResult, BestScores, ScreenState } from './game/types';
import { TitleScreen } from './screens/TitleScreen';
import { LevelSelectScreen } from './screens/LevelSelectScreen';
import { BriefingScreen } from './screens/BriefingScreen';
import { ConfigurationScreen } from './screens/ConfigurationScreen';
import { SimulationScreen } from './screens/SimulationScreen';
import { ResultsScreen } from './screens/ResultsScreen';

export function App() {
    const [screen, setScreen] = useState<ScreenState>('title');
    const [currentLevel, setCurrentLevel] = useState<Level | null>(null);
    const [bestScores, setBestScores] = useState<BestScores>({});
    const [results, setResults] = useState<SimulationResult | null>(null);
    const [pendingConfig, setPendingConfig] = useState<GameConfig | null>(null);
    const [lastConfig, setLastConfig] = useState<GameConfig | null>(null);
    const [isNewBest, setIsNewBest] = useState(false);

    const handleSelectLevel = useCallback((level: Level) => {
        setCurrentLevel(level);
        setLastConfig(null);
        setScreen('briefing');
    }, []);

    const handleRunSimulation = useCallback((config: GameConfig) => {
        setPendingConfig(config);
        setScreen('simulating');
    }, []);

    const handleSimulationComplete = useCallback(() => {
        if (!currentLevel || !pendingConfig) return;
        const simResults = runSimulation(currentLevel, pendingConfig);
        setResults(simResults);
        setLastConfig(pendingConfig);
        const prev = bestScores[currentLevel.id] ?? 0;
        if (simResults.overallScore > prev) {
            setBestScores(prevScores => ({ ...prevScores, [currentLevel.id]: simResults.overallScore }));
            setIsNewBest(true);
        } else {
            setIsNewBest(false);
        }
        setScreen('results');
    }, [currentLevel, pendingConfig, bestScores]);

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

    return (
        <div className="min-h-screen bg-terminal-bg">
            {screen === 'title' && <TitleScreen onStart={() => setScreen('levelSelect')} />}
            {screen === 'levelSelect' && (
                <LevelSelectScreen
                    levels={LEVELS}
                    bestScores={bestScores}
                    onSelectLevel={handleSelectLevel}
                    onBack={() => setScreen('title')}
                />
            )}
            {screen === 'briefing' && currentLevel && (
                <BriefingScreen
                    level={currentLevel}
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
            {screen === 'simulating' && currentLevel && pendingConfig && (
                <SimulationScreen level={currentLevel} config={pendingConfig} onComplete={handleSimulationComplete} />
            )}
            {screen === 'results' && currentLevel && results && (
                <ResultsScreen
                    level={currentLevel}
                    results={results}
                    onAdjust={() => setScreen('config')}
                    onResetTry={() => { setLastConfig(null); setScreen('config'); }}
                    onNextLevel={handleNextLevel}
                    onLevelSelect={() => setScreen('levelSelect')}
                    hasNextLevel={hasNextLevel}
                    isNewBest={isNewBest}
                />
            )}
        </div>
    );
}
