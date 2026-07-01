// Queue Quest — game model types
// Pure types, no React or DOM dependencies.

export type BotDetection = 'low' | 'medium' | 'high' | 'aggressive';
export type Verification = 'none' | 'basic' | 'verified';
export type ResalePolicy = 'none' | 'caps' | 'face' | 'no_resale';

// 5 numbered levels
export type LevelId = 1 | 2 | 3 | 4 | 5;

export type IconName =
    | 'Activity' | 'Bot' | 'Shield' | 'Ticket' | 'Server' | 'Clock' | 'Users' | 'Alert'
    | 'Check' | 'X' | 'Lock' | 'Play' | 'ArrowRight' | 'ArrowLeft' | 'Refresh' | 'Target'
    | 'Layers' | 'Zap' | 'Heart' | 'Scale' | 'Dollar'
    | 'Building' | 'Stadium' | 'Music' | 'Trophy' | 'Star';

export interface LevelWeights {
    fans: number;
    bots: number;
    checkout: number;
    satisfaction: number;
    stability: number;
    fairness: number;
}

export interface Level {
    id: LevelId;
    name: string;
    subtitle: string;
    description: string;
    seats: number;
    demand: number;
    botPressure: number;      // 0-1
    resalePressure: number;   // 0-1
    serverRisk: number;       // 0-1
    parScore: number;
    icon: IconName;
    threatProfile: string;
    constraint: string;
    weights: LevelWeights;
}

export interface GameConfig {
    waitingRoomTime: number;   // hours (0.5-24)
    botDetection: BotDetection;
    verification: Verification;
    purchaseLimit: number;     // tickets (1-8)
    resale: ResalePolicy;
    waveCount: number;         // (1-8)
    waveInterval: number;      // minutes (5-60)
    accessiblePercent: number; // % (1-15)
    presalePercent: number;    // % (0-50)
}

export interface Option<T extends string> {
    value: T;
    label: string;
    shortDesc: string;
}

export type WarningSeverity = 'warning' | 'danger';

export interface Warning {
    severity: WarningSeverity;
    label: string;
    cause: string;
    metric: string;
    priority: number;
}

export interface LeverImpact {
    lever: string;
    impact: number;
    label: string;
    why: string;
}

export type TraceTone = 'red' | 'amber' | 'green' | 'cyan';

export interface TraceEvent {
    label: string;
    detail: string;
    tone: TraceTone;
}

export interface SimulationResult {
    realFansServed: number;
    totalSeats: number;
    botsBlocked: number;
    botsGotThrough: number;
    botTickets: number;
    checkoutSuccessRate: number;
    satisfaction: number;
    siteStability: number;
    fairness: number;
    serverLoad: number;
    fansServedPct: number;
    botsBlockedPct: number;
    overallScore: number;
    leverImpacts: LeverImpact[];
    trace: TraceEvent[];
    passed: boolean;
    config: GameConfig;
}

export interface ProjectionResult {
    botExposure: number;
    fanFriction: number;
    loadRisk: number;
    publicPercent: number;
    publicInventory: number;
    fairnessEstimate: number;
    presaleTickets: number;
    accessibleTickets: number;
    presalePressure: number;
    accessCoverage: number;
    warnings: Warning[];
}

export type RankColor = 'red' | 'amber' | 'green' | 'cyan' | 'gold';

export interface Rank {
    key: 'fail' | 'near' | 'pass' | 'excellent' | 'mastered';
    label: string;
    color: RankColor;
    tier: 0 | 1 | 2 | 3 | 4;
}

export interface NextRankThreshold {
    needed: number;
    label: string;
}

export type ScreenState =
    | 'title'
    | 'levelSelect'
    | 'briefing'
    | 'config'
    | 'simulating'
    | 'results';

export type BestScores = Partial<Record<LevelId, number>>;

// Primary metric labels — used across debrief & recommendations
export type MetricKey =
    | 'Fans Served'
    | 'Bots Blocked'
    | 'Checkout Rate'
    | 'Satisfaction'
    | 'Stability'
    | 'Fairness';
