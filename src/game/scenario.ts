import type { Level } from './types';

// Apply a level's scenario modifier to produce the "effective level" that the
// simulation and live projections actually run against. Deterministic — each
// level always applies its own single modifier, no randomness.
//
// Base level values are preserved for briefings (which forecast the scenario);
// only the effective run is affected. Identity, weights, parScore, and id are
// carried through unchanged so all id-based simulation branches still work.
export function applyScenario(level: Level): Level {
    const s = level.identity.scenario;
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
    return {
        ...level,
        demand: Math.round(level.demand * (s.demandMult ?? 1)),
        botPressure: clamp01(level.botPressure * (s.botPressureMult ?? 1)),
        resalePressure: clamp01(level.resalePressure * (s.resalePressureMult ?? 1)),
        serverRisk: clamp01(level.serverRisk * (s.serverRiskMult ?? 1)),
    };
}
