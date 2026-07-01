import type {
    Level,
    GameConfig,
    SimulationResult,
    LeverImpact,
    TraceEvent,
    BotDetection,
    Verification,
    ResalePolicy,
} from './types';

const BOT_DETECTION_EFFECTIVENESS: Record<BotDetection, number> = { low: 0.20, medium: 0.50, high: 0.78, aggressive: 0.94 };
const BOT_DETECTION_FRICTION: Record<BotDetection, number> = { low: 0.02, medium: 0.06, high: 0.14, aggressive: 0.30 };
const VERIFICATION_EFFECTIVENESS: Record<Verification, number> = { none: 0, basic: 0.25, verified: 0.75 };
const VERIFICATION_FRICTION: Record<Verification, number> = { none: 0, basic: 0.04, verified: 0.18 };
const RESALE_SATISFACTION: Record<ResalePolicy, number> = { none: -6, caps: 4, face: 10, no_resale: -2 };
const RESALE_FAIRNESS: Record<ResalePolicy, number> = { none: -12, caps: 4, face: 12, no_resale: 8 };
const RESALE_FAIRNESS_HIGH_PRESSURE: Record<ResalePolicy, number> = { none: -6, caps: 2, face: 5, no_resale: 4 };
const RESALE_SATISFACTION_PLAYOFF: Record<ResalePolicy, number> = { none: -6, caps: 2, face: 6, no_resale: 0 };

export function runSimulation(level: Level, config: GameConfig): SimulationResult {
    const { seats, demand, botPressure, resalePressure, serverRisk, weights } = level;
    const baseBotAttempts = Math.floor(demand * botPressure);

    const botDetE = BOT_DETECTION_EFFECTIVENESS[config.botDetection];
    const botDetF = BOT_DETECTION_FRICTION[config.botDetection];
    const vE = VERIFICATION_EFFECTIVENESS[config.verification];
    const vF = VERIFICATION_FRICTION[config.verification];

    const combinedBotBlock = Math.min(0.98, botDetE + vE * 0.3);
    const botsBlocked = Math.floor(baseBotAttempts * combinedBotBlock);
    const botsGotThrough = baseBotAttempts - botsBlocked;

    const avgBotTickets = Math.max(1, config.purchaseLimit * 0.8);
    const botTickets = Math.min(seats * 0.4, botsGotThrough * avgBotTickets / config.purchaseLimit);
    const waitingRoomHours = config.waitingRoomTime;
    const botPreparationBonus = Math.max(0, (waitingRoomHours - 1) * 0.03);
    const shortNoticePenalty = level.id === 4 ? Math.max(0, (waitingRoomHours - 2) * 0.02) : 0;
    const adjustedBotTickets = botTickets * (1 + botPreparationBonus + shortNoticePenalty);

    // Server load — wave count acts as pressure release valve, excess waves stress the system
    const baseLoad = demand / seats;
    const excessWaves = Math.max(0, config.waveCount - 4);
    const waveLoadMultiplier = config.waveCount > 1
        ? Math.max(0.35, 1 - (config.waveCount - 1) * 0.16 + excessWaves * 0.18)
        : 1;
    const intervalLoadReduction = config.waveCount > 1 ? Math.min(0.12, (config.waveInterval - 5) * 0.003) : 0;
    const presaleLoadReduction = config.presalePercent * 0.005;
    const serverScenarioLoad = serverRisk * 1.5;
    const serverLoad = Math.min(100, (baseLoad * 1.7 * waveLoadMultiplier * (1 - intervalLoadReduction) - presaleLoadReduction + serverScenarioLoad) * 9);
    const excessWavePenalty = config.waveCount > 5 ? (config.waveCount - 5) * 6 : 0;
    const longWaitPenalty = waitingRoomHours > 12 ? (waitingRoomHours - 12) * 0.8 : 0;
    const siteStability = Math.max(20, Math.min(100, 128 - serverLoad * 0.72 - excessWavePenalty - longWaitPenalty));

    const totalFriction = botDetF + vF;
    const checkoutSuccessRate = Math.max(40, Math.min(98,
        siteStability * 0.6 + (100 - totalFriction * 100) * 0.4 - (config.waveCount > 4 ? 3 : 0)
    ));

    const realFanDemand = demand - baseBotAttempts;
    const effectiveRealFans = realFanDemand * (1 - totalFriction) * (checkoutSuccessRate / 100);
    const presaleTickets = Math.floor(seats * config.presalePercent / 100);
    const accessibleTickets = Math.floor(seats * config.accessiblePercent / 100);
    const publicTickets = seats - presaleTickets - accessibleTickets;
    const ticketsToRealFans = Math.min(
        publicTickets - Math.floor(adjustedBotTickets),
        effectiveRealFans * (config.purchaseLimit / 4)
    );
    const realFansServed = Math.max(0, Math.floor(ticketsToRealFans / 2)) + presaleTickets + accessibleTickets;

    // Satisfaction
    let satisfaction = 62;
    satisfaction += (realFansServed / seats) * 30;
    satisfaction += (checkoutSuccessRate - 50) * 0.3;
    satisfaction += config.accessiblePercent * 0.6;
    satisfaction += config.waveCount > 1 && config.waveCount <= 4 ? 10 : 0;
    satisfaction -= totalFriction * 40;
    satisfaction -= (100 - siteStability) * 0.3;
    satisfaction -= waitingRoomHours > 4 ? (waitingRoomHours - 4) * 2 : 0;
    satisfaction -= config.verification === 'verified' ? 4 : 0;
    satisfaction += RESALE_SATISFACTION[config.resale];
    if (config.resale === 'no_resale' && resalePressure < 0.6) satisfaction -= 4;
    if (level.id === 4) satisfaction += RESALE_SATISFACTION_PLAYOFF[config.resale];
    satisfaction = Math.max(20, Math.min(100, satisfaction));

    // Fairness
    let fairness = 58;
    fairness += (realFansServed / seats) * 20;
    fairness += (botsBlocked / Math.max(1, baseBotAttempts)) * 15;
    fairness += config.accessiblePercent * 1.2;
    fairness -= config.presalePercent > 30 ? (config.presalePercent - 30) * 0.6 : 0;
    fairness -= config.presalePercent > 40 ? (config.presalePercent - 40) * 0.8 : 0;
    fairness += vE * 10;
    fairness += RESALE_FAIRNESS[config.resale];
    if (resalePressure > 0.7) fairness += RESALE_FAIRNESS_HIGH_PRESSURE[config.resale];
    fairness += (8 - config.purchaseLimit) * 2;
    if (level.id === 3) fairness += config.accessiblePercent * 0.5;
    fairness = Math.max(20, Math.min(100, fairness));

    const fansServedPct = Math.min(100, (realFansServed / seats) * 100);
    const botsBlockedPct = (botsBlocked / Math.max(1, baseBotAttempts)) * 100;

    const overallScore = Math.round(
        fansServedPct * weights.fans +
        botsBlockedPct * weights.bots +
        checkoutSuccessRate * weights.checkout +
        satisfaction * weights.satisfaction +
        siteStability * weights.stability +
        fairness * weights.fairness
    );

    const leverImpacts = analyzeLevers(level, config, {
        botsBlocked, baseBotAttempts, botsGotThrough,
        checkoutSuccessRate, satisfaction, siteStability, fairness,
    });

    const trace: TraceEvent[] = [];
    const peakLoad = Math.round(serverLoad);
    const peakWave = config.waveCount > 1 ? Math.min(2, config.waveCount) : 1;
    trace.push({
        label: 'Peak load',
        detail: `Server load reached ${peakLoad}%${config.waveCount > 1 ? ` during Wave ${peakWave}` : ' at open'}.`,
        tone: peakLoad > 70 ? 'red' : peakLoad > 45 ? 'amber' : 'green',
    });
    const blockPct = Math.round((botsBlocked / Math.max(1, baseBotAttempts)) * 100);
    trace.push({
        label: 'Bot filter',
        detail: `Blocked ${blockPct}%${blockPct < 100 ? `; ${100 - blockPct}% reached checkout` : ''}.`,
        tone: blockPct >= 80 ? 'green' : blockPct >= 55 ? 'amber' : 'red',
    });
    trace.push({
        label: 'Fans admitted',
        detail: `${Math.round(realFansServed).toLocaleString()} of ${seats.toLocaleString()} seats (${Math.round(fansServedPct)}%).`,
        tone: fansServedPct > 50 ? 'green' : fansServedPct > 25 ? 'amber' : 'red',
    });
    if (checkoutSuccessRate < 65) {
        trace.push({ label: 'Checkout bottleneck', detail: `Only ${Math.round(checkoutSuccessRate)}% of fans completed checkout — timeouts and friction cost seats.`, tone: 'red' });
    } else {
        trace.push({ label: 'Checkout', detail: `${Math.round(checkoutSuccessRate)}% completed checkout successfully.`, tone: 'green' });
    }
    if (config.presalePercent > 30) {
        trace.push({ label: 'Inventory pressure', detail: `Public pool tightened after ${config.presalePercent}% presale allocation.`, tone: 'amber' });
    } else if (config.presalePercent > 0) {
        trace.push({ label: 'Inventory split', detail: `${config.presalePercent}% presale absorbed early demand.`, tone: 'green' });
    }

    const clamped = Math.min(100, Math.max(0, overallScore));
    return {
        realFansServed: Math.round(realFansServed),
        totalSeats: seats,
        botsBlocked: Math.round(botsBlocked),
        botsGotThrough: Math.round(botsGotThrough),
        botTickets: Math.round(adjustedBotTickets),
        checkoutSuccessRate: Math.round(checkoutSuccessRate),
        satisfaction: Math.round(satisfaction),
        siteStability: Math.round(siteStability),
        fairness: Math.round(fairness),
        serverLoad: Math.round(serverLoad),
        fansServedPct: Math.round(fansServedPct),
        botsBlockedPct: Math.round(botsBlockedPct),
        overallScore: clamped,
        leverImpacts,
        trace,
        passed: clamped >= level.parScore,
        config,
    };
}

interface LeverMetrics {
    botsBlocked: number;
    baseBotAttempts: number;
    botsGotThrough: number;
    checkoutSuccessRate: number;
    satisfaction: number;
    siteStability: number;
    fairness: number;
}

export function analyzeLevers(level: Level, config: GameConfig, m: LeverMetrics): LeverImpact[] {
    const impacts: LeverImpact[] = [];

    // Bot Detection
    if (config.botDetection === 'low') {
        impacts.push({ lever: 'Bot Detection', impact: -18 - level.botPressure * 25, label: 'Basic bot defense',
            why: 'Weak detection let too many bots through — fairness collapsed.' });
    } else if (config.botDetection === 'aggressive' && m.satisfaction < 60) {
        impacts.push({ lever: 'Bot Detection', impact: -14, label: 'Maximum bot defense',
            why: 'Aggressive screening frustrated legitimate fans with false positives.' });
    } else if (config.botDetection === 'aggressive') {
        impacts.push({ lever: 'Bot Detection', impact: 6, label: 'Maximum bot defense',
            why: 'Heavy defense paid off against high bot pressure.' });
    } else if (config.botDetection === 'high') {
        impacts.push({ lever: 'Bot Detection', impact: 15, label: 'Enhanced detection',
            why: 'Behavioral analysis caught most bots without excessive friction.' });
    } else {
        impacts.push({ lever: 'Bot Detection', impact: level.botPressure > 0.4 ? -10 : 6, label: 'Standard detection',
            why: level.botPressure > 0.4 ? 'Standard detection was insufficient at this bot pressure.' : 'Standard detection was proportional to the threat.' });
    }

    // Verification
    if (config.verification === 'none') {
        impacts.push({ lever: 'Verification', impact: -10, label: 'No verification',
            why: 'Open access let fake accounts proliferate.' });
    } else if (config.verification === 'verified' && level.botPressure < 0.4) {
        impacts.push({ lever: 'Verification', impact: -8, label: 'ID verification',
            why: 'ID requirements were overkill for this threat level and hurt satisfaction.' });
    } else if (config.verification === 'verified') {
        impacts.push({ lever: 'Verification', impact: 12, label: 'ID verification',
            why: 'Strong identity check was warranted at this scale.' });
    } else {
        impacts.push({ lever: 'Verification', impact: 6, label: 'Email verification',
            why: 'Email verification balanced friction with security.' });
    }

    // Entry Waves
    const highDemand = level.demand / level.seats > 6;
    if (config.waveCount === 1 && highDemand) {
        impacts.push({ lever: 'Entry Waves', impact: -20, label: 'Single wave',
            why: 'No staggering — the whole demand hit at once and stability collapsed.' });
    } else if (config.waveCount >= 2 && config.waveCount <= 4) {
        impacts.push({ lever: 'Entry Waves', impact: 15, label: `${config.waveCount} waves`,
            why: 'Staggered entry distributed server load and gave more fans a fair shot.' });
    } else if (config.waveCount > 5) {
        impacts.push({ lever: 'Entry Waves', impact: -10, label: `${config.waveCount} waves`,
            why: 'Too many waves caused repeated stress and prolonged uncertainty.' });
    } else {
        impacts.push({ lever: 'Entry Waves', impact: 3, label: `${config.waveCount} waves`,
            why: 'Wave count was reasonable but not optimal.' });
    }

    // Purchase Limit
    if (config.purchaseLimit >= 6) {
        impacts.push({ lever: 'Purchase Limit', impact: -10, label: `${config.purchaseLimit} tix max`,
            why: 'High limits let groups and bots grab large blocks.' });
    } else if (config.purchaseLimit <= 2) {
        impacts.push({ lever: 'Purchase Limit', impact: 8, label: `${config.purchaseLimit} tix max`,
            why: 'Tight limits spread tickets across more fans.' });
    } else {
        impacts.push({ lever: 'Purchase Limit', impact: 5, label: `${config.purchaseLimit} tix max`,
            why: 'Moderate limit balanced groups and fairness.' });
    }

    // Resale
    if (config.resale === 'none' && level.resalePressure > 0.5) {
        impacts.push({ lever: 'Resale Policy', impact: -16, label: 'Open resale market',
            why: 'No restrictions enabled immediate scalper markup.' });
    } else if (config.resale === 'face') {
        impacts.push({ lever: 'Resale Policy', impact: 13, label: 'Face-value only',
            why: 'Face-value resale maintained fair pricing.' });
    } else if (config.resale === 'no_resale') {
        impacts.push({ lever: 'Resale Policy', impact: 4, label: 'Non-transferable',
            why: 'Strict anti-scalp but blocked legitimate transfers.' });
    } else {
        impacts.push({ lever: 'Resale Policy', impact: 6, label: 'Price-capped resale',
            why: 'Price caps reduced extreme markups.' });
    }

    // Presale
    if (config.presalePercent > 40) {
        impacts.push({ lever: 'Presale Allocation', impact: -14, label: `${config.presalePercent}% presale`,
            why: 'Large presale left general public feeling shut out.' });
    } else if (config.presalePercent >= 15 && config.presalePercent <= 30) {
        impacts.push({ lever: 'Presale Allocation', impact: 6, label: `${config.presalePercent}% presale`,
            why: 'Moderate presale rewarded loyalty without excluding public.' });
    } else if (config.presalePercent === 0) {
        impacts.push({ lever: 'Presale Allocation', impact: -3, label: 'No presale',
            why: 'No presale concentrated all chaos in the public sale.' });
    } else {
        impacts.push({ lever: 'Presale Allocation', impact: 2, label: `${config.presalePercent}% presale`,
            why: 'Light presale had minimal impact on public sale.' });
    }

    // Accessibility
    if (config.accessiblePercent >= 5) {
        impacts.push({ lever: 'Accessibility', impact: 8, label: `${config.accessiblePercent}% accessible`,
            why: 'Reserved accessible inventory improved fairness coverage.' });
    } else {
        impacts.push({ lever: 'Accessibility', impact: -3, label: `${config.accessiblePercent}% accessible`,
            why: 'Minimal accessible reservation limited coverage.' });
    }

    // Waiting Room
    const isShortNotice = level.id === 4;
    if (config.waitingRoomTime > 6) {
        impacts.push({ lever: 'Waiting Room', impact: isShortNotice ? -10 : -6, label: `${config.waitingRoomTime}h early`,
            why: isShortNotice ? 'Long lead time compressed short-notice demand into chaos.' : 'Long lead time gave bots more setup time.' });
    } else if (config.waitingRoomTime < 1) {
        impacts.push({ lever: 'Waiting Room', impact: -4, label: `${config.waitingRoomTime}h early`,
            why: 'Last-minute opening created a rush.' });
    } else {
        impacts.push({ lever: 'Waiting Room', impact: 4, label: `${config.waitingRoomTime}h early`,
            why: 'Reasonable lead time without giving bots too much prep.' });
    }

    return impacts;
}
