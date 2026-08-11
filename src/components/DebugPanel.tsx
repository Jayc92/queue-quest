// Queue Quest — Developer Debug Panel.
//
// Rendered by App ONLY when isDebugEnabled() is true (?debug=1 or the
// queueQuest.debug localStorage flag). Never present in normal play. A floating
// button toggles a compact panel of QA shortcuts. All actions go through the
// same pure records/devtools helpers the game and tests use.

import { useEffect, useState } from 'react';
import type { Level, LevelId, RecordsStore, ScreenState } from '../game/types';
import {
    seedFreshStore, seedCampaignCleared, seedCampaignMastered,
} from '../game/devtools';
import { getDebugFlags, setSuppressIncidents, requestForceCollapse, subscribeDebug } from '../game/debugControl';

interface Props {
    levels: Level[];
    records: RecordsStore;
    screen: ScreenState;
    onApplyStore: (store: RecordsStore) => void;
    onJumpToMission: (levelId: LevelId) => void;
    onGoEndless: () => void;
    onResetRecords: () => void;
}

// Deliberately plain inline styles so the panel is visually distinct from the
// game UI (a red developer chrome) and never depends on the design system.
const box: React.CSSProperties = {
    position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
    fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
};

export function DebugPanel({ levels, records, screen, onApplyStore, onJumpToMission, onGoEndless, onResetRecords }: Props) {
    const [open, setOpen] = useState(false);
    const [, force] = useState(0);
    useEffect(() => subscribeDebug(() => force(n => n + 1)), []);

    const flags = getDebugFlags();
    const cleared = Object.values(records.missions).filter(m => (m?.clears ?? 0) > 0).length;
    const mastered = Object.values(records.missions).filter(m => m?.mastered).length;

    const btn: React.CSSProperties = {
        display: 'block', width: '100%', textAlign: 'left', margin: '2px 0', padding: '4px 6px',
        background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4, cursor: 'pointer',
    };

    if (!open) {
        return (
            <div style={box}>
                <button
                    onClick={() => setOpen(true)}
                    style={{ padding: '6px 10px', background: '#7f1d1d', color: '#fecaca', border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
                    aria-label="Open developer debug panel"
                >
                    ⚙ DEBUG
                </button>
            </div>
        );
    }

    return (
        <div style={{ ...box, width: 220, background: '#0b1220', border: '1px solid #ef4444', borderRadius: 8, padding: 10, color: '#e2e8f0', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ color: '#fca5a5' }}>DEV DEBUG</strong>
                <button onClick={() => setOpen(false)} style={{ color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none', fontSize: 14 }} aria-label="Close debug panel">✕</button>
            </div>

            <div style={{ color: '#64748b', marginBottom: 4 }}>
                screen: <span style={{ color: '#22d3ee' }}>{screen}</span><br />
                cleared {cleared}/5 · mastered {mastered}/5<br />
                endless runs: {records.endless?.runs ?? 0} · training: {records.trainingComplete ? 'done' : 'no'}
            </div>

            <div style={{ color: '#64748b', margin: '6px 0 2px' }}>JUMP TO MISSION</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
                {levels.map(l => (
                    <button key={l.id} onClick={() => onJumpToMission(l.id)} style={{ ...btn, textAlign: 'center', margin: 0 }} title={l.name}>
                        {l.id}
                    </button>
                ))}
            </div>
            <button onClick={onGoEndless} style={btn}>▶ Go to Endless</button>

            <div style={{ color: '#64748b', margin: '6px 0 2px' }}>PROGRESSION</div>
            <button onClick={() => onApplyStore(seedCampaignCleared())} style={btn}>Unlock campaign (clear all)</button>
            <button onClick={() => onApplyStore(seedCampaignMastered())} style={btn}>Master everything</button>
            <button onClick={() => onApplyStore(seedEndlessUnlockedStore())} style={btn}>Unlock Endless</button>
            <button onClick={() => onApplyStore(seedFreshStore())} style={btn}>Seed fresh player</button>
            <button onClick={onResetRecords} style={{ ...btn, borderColor: '#ef4444', color: '#fca5a5' }}>Reset records</button>

            <div style={{ color: '#64748b', margin: '6px 0 2px' }}>ENDLESS (live)</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={flags.suppressIncidents} onChange={e => setSuppressIncidents(e.target.checked)} />
                Suppress incidents
            </label>
            <button
                onClick={requestForceCollapse}
                disabled={screen !== 'endlessShift'}
                style={{ ...btn, opacity: screen === 'endlessShift' ? 1 : 0.4 }}
            >
                Force collapse
            </button>
        </div>
    );
}

// Kept local to avoid an extra import line churn; identical to devtools.seedEndlessUnlocked.
function seedEndlessUnlockedStore(): RecordsStore {
    return seedCampaignCleared();
}
