import type {
    Level,
    GameConfig,
    ProjectionResult,
    Warning,
} from './types';
// Projections read the SAME lever tables and weights the campaign sim uses
// (balance.ts), so the pre-launch forecast stays consistent with the result.
// Alert trigger points live in balance.ts (ALERT).
import {
    SIM,
    PROJECTION,
    ALERT,
    BOT_DETECTION_EFFECTIVENESS as BOT_DETECTION_EFF,
    BOT_DETECTION_FRICTION as BOT_DETECTION_FRIC,
    VERIFICATION_EFFECTIVENESS as VERIFICATION_EFF,
    VERIFICATION_FRICTION as VERIFICATION_FRIC,
    RESALE_FAIRNESS,
} from './balance';

export function calculateProjections(level: Level, config: GameConfig): ProjectionResult {
    const { seats, demand, resalePressure, serverRisk } = level;

    const botDetE = BOT_DETECTION_EFF[config.botDetection];
    const botDetF = BOT_DETECTION_FRIC[config.botDetection];
    const vE = VERIFICATION_EFF[config.verification];
    const vF = VERIFICATION_FRIC[config.verification];

    const botBlock = Math.min(SIM.maxBotBlock, botDetE + vE * SIM.verificationBlockScale);
    const botExposure = Math.round((1 - botBlock) * 100);
    const fanFriction = Math.round((botDetF + vF) * 100);

    const baseLoad = demand / seats;
    const excessWaves = Math.max(0, config.waveCount - SIM.waveReliefKnee);
    const waveLoadMultiplier = config.waveCount > 1
        ? Math.max(SIM.waveLoadFloor, 1 - (config.waveCount - 1) * SIM.waveReliefPerWave + excessWaves * SIM.waveExcessPenaltyPerWave)
        : 1;
    const loadRisk = Math.min(100, Math.round((baseLoad * PROJECTION.loadBaseMult * waveLoadMultiplier + serverRisk * PROJECTION.loadServerRiskWeight) * PROJECTION.loadScale));

    const presaleTickets = Math.floor(seats * config.presalePercent / 100);
    const accessibleTickets = Math.floor(seats * config.accessiblePercent / 100);
    const publicInventory = seats - presaleTickets - accessibleTickets;
    const publicPercent = Math.round((publicInventory / seats) * 100);

    // Fairness estimate mirrors the sim's config-driven fairness terms.
    let fairness: number = SIM.fairnessBase;
    fairness += vE * SIM.fairVerificationWeight;
    fairness += RESALE_FAIRNESS[config.resale];
    fairness += (8 - config.purchaseLimit) * SIM.fairPurchaseLimitWeight;
    fairness += config.accessiblePercent * SIM.fairAccessiblePerPct;
    fairness -= config.presalePercent > SIM.fairPresaleKnee ? (config.presalePercent - SIM.fairPresaleKnee) * SIM.fairPresalePenalty1 : 0;
    fairness -= config.presalePercent > SIM.fairPresaleKnee2 ? (config.presalePercent - SIM.fairPresaleKnee2) * SIM.fairPresalePenalty2 : 0;
    const fairnessEstimate = Math.max(0, Math.min(100, Math.round(fairness)));

    const presalePressure = Math.round((config.presalePercent / 50) * 100);
    const accessCoverage = Math.round((config.accessiblePercent / 15) * 100);

    // Pre-run warnings — each has severity, label, cause, metric, priority. Trigger thresholds: ALERT.
    const warnings: Warning[] = [];
    if (botExposure > ALERT.botExposureHigh) warnings.push({ severity: 'danger', label: 'Bot exposure high', cause: 'Current defense leaves automated traffic room.', metric: 'Bots Blocked', priority: 90 });
    if (fanFriction > ALERT.fanFrictionCritical) warnings.push({ severity: 'danger', label: 'Fan friction critical', cause: 'Verification and detection may block legit fans.', metric: 'Satisfaction', priority: 85 });
    if (config.waveCount === 1 && baseLoad > ALERT.singleWaveBaseLoad) warnings.push({ severity: 'danger', label: 'Single-wave load spike', cause: 'All demand hits the server at once.', metric: 'Stability', priority: 95 });
    if (config.resale === 'none' && resalePressure > 0.5) warnings.push({ severity: 'danger', label: 'Resale pressure unchecked', cause: 'Scalpers will flood secondary markets immediately.', metric: 'Fairness', priority: 80 });
    if (publicPercent < ALERT.publicPoolThin) warnings.push({ severity: 'warning', label: 'Public pool thin', cause: 'Presale allocation is squeezing general onsale.', metric: 'Fans Served', priority: 70 });
    if (config.presalePercent > ALERT.presaleOverAllocated) warnings.push({ severity: 'warning', label: 'Presale over-allocated', cause: 'Large presale leaves fewer public seats.', metric: 'Fairness', priority: 60 });
    if (config.accessiblePercent <= ALERT.accessibilityLow) warnings.push({ severity: 'warning', label: 'Accessibility low', cause: 'Reserved coverage is very thin.', metric: 'Fairness', priority: 40 });
    if (config.waitingRoomTime > ALERT.longLeadHours && level.id === 4) warnings.push({ severity: 'warning', label: 'Long lead time', cause: 'Short-notice demand does not benefit from long waits.', metric: 'Satisfaction', priority: 65 });
    if (config.waveCount > ALERT.tooManyWaves) warnings.push({ severity: 'warning', label: 'Too many waves', cause: 'Repeated stress on the system hurts stability.', metric: 'Stability', priority: 55 });
    if (config.waitingRoomTime > ALERT.waitingRoomTooLong) warnings.push({ severity: 'warning', label: 'Waiting room too long', cause: 'Long lead time gives bots more setup time.', metric: 'Bots Blocked', priority: 50 });
    if (fanFriction > ALERT.fanFrictionRising && fanFriction <= ALERT.fanFrictionCritical) warnings.push({ severity: 'warning', label: 'Fan friction rising', cause: 'Verification stack starting to hurt satisfaction.', metric: 'Satisfaction', priority: 45 });
    warnings.sort((a, b) => b.priority - a.priority);

    return {
        botExposure, fanFriction, loadRisk, publicPercent, publicInventory,
        fairnessEstimate, presaleTickets, accessibleTickets,
        presalePressure, accessCoverage, warnings,
    };
}
