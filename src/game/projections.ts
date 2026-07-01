import type {
    Level,
    GameConfig,
    ProjectionResult,
    Warning,
    BotDetection,
    Verification,
    ResalePolicy,
} from './types';

const BOT_DETECTION_EFF: Record<BotDetection, number> = { low: 0.20, medium: 0.50, high: 0.78, aggressive: 0.94 };
const BOT_DETECTION_FRIC: Record<BotDetection, number> = { low: 0.02, medium: 0.06, high: 0.14, aggressive: 0.30 };
const VERIFICATION_EFF: Record<Verification, number> = { none: 0, basic: 0.25, verified: 0.75 };
const VERIFICATION_FRIC: Record<Verification, number> = { none: 0, basic: 0.04, verified: 0.18 };
const RESALE_FAIRNESS: Record<ResalePolicy, number> = { none: -12, caps: 4, face: 12, no_resale: 8 };

export function calculateProjections(level: Level, config: GameConfig): ProjectionResult {
    const { seats, demand, resalePressure, serverRisk } = level;

    const botDetE = BOT_DETECTION_EFF[config.botDetection];
    const botDetF = BOT_DETECTION_FRIC[config.botDetection];
    const vE = VERIFICATION_EFF[config.verification];
    const vF = VERIFICATION_FRIC[config.verification];

    const botBlock = Math.min(0.98, botDetE + vE * 0.3);
    const botExposure = Math.round((1 - botBlock) * 100);
    const fanFriction = Math.round((botDetF + vF) * 100);

    const baseLoad = demand / seats;
    const excessWaves = Math.max(0, config.waveCount - 4);
    const waveLoadMultiplier = config.waveCount > 1
        ? Math.max(0.35, 1 - (config.waveCount - 1) * 0.16 + excessWaves * 0.18)
        : 1;
    const loadRisk = Math.min(100, Math.round((baseLoad * 1.7 * waveLoadMultiplier + serverRisk * 15) * 4));

    const presaleTickets = Math.floor(seats * config.presalePercent / 100);
    const accessibleTickets = Math.floor(seats * config.accessiblePercent / 100);
    const publicInventory = seats - presaleTickets - accessibleTickets;
    const publicPercent = Math.round((publicInventory / seats) * 100);

    let fairness = 58;
    fairness += vE * 10;
    fairness += RESALE_FAIRNESS[config.resale];
    fairness += (8 - config.purchaseLimit) * 2;
    fairness += config.accessiblePercent * 1.2;
    fairness -= config.presalePercent > 30 ? (config.presalePercent - 30) * 0.6 : 0;
    fairness -= config.presalePercent > 40 ? (config.presalePercent - 40) * 0.8 : 0;
    const fairnessEstimate = Math.max(0, Math.min(100, Math.round(fairness)));

    const presalePressure = Math.round((config.presalePercent / 50) * 100);
    const accessCoverage = Math.round((config.accessiblePercent / 15) * 100);

    // Pre-run warnings — each has severity, label, cause, metric, priority
    const warnings: Warning[] = [];
    if (botExposure > 55) warnings.push({ severity: 'danger', label: 'Bot exposure high', cause: 'Current defense leaves automated traffic room.', metric: 'Bots Blocked', priority: 90 });
    if (fanFriction > 30) warnings.push({ severity: 'danger', label: 'Fan friction critical', cause: 'Verification and detection may block legit fans.', metric: 'Satisfaction', priority: 85 });
    if (config.waveCount === 1 && baseLoad > 4) warnings.push({ severity: 'danger', label: 'Single-wave load spike', cause: 'All demand hits the server at once.', metric: 'Stability', priority: 95 });
    if (config.resale === 'none' && resalePressure > 0.5) warnings.push({ severity: 'danger', label: 'Resale pressure unchecked', cause: 'Scalpers will flood secondary markets immediately.', metric: 'Fairness', priority: 80 });
    if (publicPercent < 55) warnings.push({ severity: 'warning', label: 'Public pool thin', cause: 'Presale allocation is squeezing general onsale.', metric: 'Fans Served', priority: 70 });
    if (config.presalePercent > 35) warnings.push({ severity: 'warning', label: 'Presale over-allocated', cause: 'Large presale leaves fewer public seats.', metric: 'Fairness', priority: 60 });
    if (config.accessiblePercent <= 2) warnings.push({ severity: 'warning', label: 'Accessibility low', cause: 'Reserved coverage is very thin.', metric: 'Fairness', priority: 40 });
    if (config.waitingRoomTime > 6 && level.id === 4) warnings.push({ severity: 'warning', label: 'Long lead time', cause: 'Short-notice demand does not benefit from long waits.', metric: 'Satisfaction', priority: 65 });
    if (config.waveCount > 5) warnings.push({ severity: 'warning', label: 'Too many waves', cause: 'Repeated stress on the system hurts stability.', metric: 'Stability', priority: 55 });
    if (config.waitingRoomTime > 12) warnings.push({ severity: 'warning', label: 'Waiting room too long', cause: 'Long lead time gives bots more setup time.', metric: 'Bots Blocked', priority: 50 });
    if (fanFriction > 20 && fanFriction <= 30) warnings.push({ severity: 'warning', label: 'Fan friction rising', cause: 'Verification stack starting to hurt satisfaction.', metric: 'Satisfaction', priority: 45 });
    warnings.sort((a, b) => b.priority - a.priority);

    return {
        botExposure, fanFriction, loadRisk, publicPercent, publicInventory,
        fairnessEstimate, presaleTickets, accessibleTickets,
        presalePressure, accessCoverage, warnings,
    };
}
