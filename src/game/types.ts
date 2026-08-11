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

export type ThreatLevel = 'Low' | 'Moderate' | 'High' | 'Severe' | 'Critical';

// A deterministic pre-launch scenario event. Each level owns exactly one.
// It adjusts effective level parameters before the simulation runs — no randomness.
export interface ScenarioModifier {
    id: string;
    label: string;              // e.g. "Unexpected traffic surge"
    detail: string;             // one-line operational note
    severity: WarningSeverity;  // 'warning' | 'danger'
    // Multipliers applied to the base level before simulation (default 1 = no change).
    serverRiskMult?: number;
    botPressureMult?: number;
    resalePressureMult?: number;
    demandMult?: number;
}

// Structured operations briefing shown before configuration.
export interface MissionBriefing {
    situation: string;
    threatAssessment: string;
    operationalGoal: string;
    knownRisks: string[];
    successCriteria: string;
}

// Identity metadata that gives each mission its personality.
export interface MissionIdentity {
    threatLevel: ThreatLevel;
    primaryConcern: string;     // e.g. "Server Stability"
    missionType: string;        // e.g. "Mass Onsale"
    briefing: MissionBriefing;
    scenario: ScenarioModifier;
    // Level-specific debrief lines keyed by outcome band.
    resultSummary: {
        strong: string;   // cleared comfortably (STRONG CLEAR / MASTERED)
        pass: string;     // cleared (CLEAR)
        fail: string;     // below target
    };
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
    identity: MissionIdentity;
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
    | 'training'
    | 'briefing'
    | 'config'
    | 'simulating'
    | 'results'
    | 'campaignComplete'
    | 'endlessBriefing'
    | 'endlessShift'
    | 'endlessReport';

export type BestScores = Partial<Record<LevelId, number>>;

// Primary metric labels — used across debrief & recommendations
export type MetricKey =
    | 'Fans Served'
    | 'Bots Blocked'
    | 'Checkout Rate'
    | 'Satisfaction'
    | 'Stability'
    | 'Fairness';

// ============================================================
// LOCAL RECORDS & MASTERY
// ============================================================

// Per-mission persisted record. Medal tier mirrors Rank.tier (0-4).
export interface MissionRecord {
    bestScore: number;
    bestMedalTier: 0 | 1 | 2 | 3 | 4;
    bestFansServed: number;      // absolute count (display)
    bestFansServedPct: number;   // percent of seats (goal logic)
    bestStability: number;
    bestFairness: number;
    bestCheckout: number;
    bestBotsBlocked: number;     // percent
    attempts: number;
    clears: number;
    mastered: boolean;
    lastPlayed: number;          // epoch ms, 0 if never
}

export interface GlobalStats {
    highestScore: number;
    totalSimulations: number;
    totalClears: number;         // cumulative clear runs
    totalMastered: number;       // cumulative mastered runs
    lastPlayed: number;          // epoch ms, 0 if never
}

export interface RecordsStore {
    version: 1;
    missions: Partial<Record<LevelId, MissionRecord>>;
    global: GlobalStats;
    endless?: EndlessRecord;    // optional — absent until Endless Shift is played
    daily?: DailyRecord;        // optional — absent until a Daily Challenge is played
    // Onboarding flags. Optional & additive so older v1 saves load unchanged
    // (a missing flag simply reads as "not done yet").
    trainingComplete?: boolean;   // finished the Training Shift at least once
    trainingSeen?: boolean;       // saw the first-launch training prompt (so we don't re-prompt)
}

// Persisted Daily Challenge progress. "Today" fields describe `dateKey` and roll
// over on the first attempt of a new local calendar day; streak/total fields are
// cumulative. All local-only — there is no leaderboard and no server.
export interface DailyRecord {
    dateKey: string;             // local "YYYY-MM-DD" the today-fields describe
    attemptsToday: number;
    bestScoreToday: number;
    bestMedalTierToday: 0 | 1 | 2 | 3 | 4;
    completedToday: boolean;     // cleared today's target at least once
    bestConfigToday?: GameConfig; // config that produced today's best score
    currentStreak: number;       // consecutive local days with a clear (as of lastCompletedDateKey)
    longestStreak: number;
    totalCompleted: number;      // distinct days ever cleared
    lastCompletedDateKey: string; // '' if never cleared any day
    lastPlayed: number;          // epoch ms
}

// Which records improved on a single run — drives results celebration.
export interface RecordImprovements {
    newBestScore: boolean;
    newBestFansServed: boolean;
    newBestStability: boolean;
    newBestFairness: boolean;
    newBestCheckout: boolean;
    newBestBotsBlocked: boolean;
    newlyMastered: boolean;
    firstClear: boolean;
    anyImprovement: boolean;
}

export type MissionGoalKey =
    | 'clear' | 'strong' | 'master' | 'beat'
    | 'fans' | 'stability' | 'fairness' | 'checkout' | 'bots';

export interface MissionGoal {
    key: MissionGoalKey;
    label: string;
    detail: string;
}

export interface OperatorSummary {
    highestScore: number;
    missionsCleared: number;   // distinct missions cleared
    missionsMastered: number;  // distinct missions mastered
    totalRuns: number;
    lastPlayed: number;
}

// Campaign completion — shown once all five missions are cleared.
export interface CampaignStatus {
    complete: boolean;               // all 5 missions cleared
    missionsCleared: number;
    strongClears: number;            // distinct missions at STRONG CLEAR+ (tier >= 3)
    missionsMastered: number;
    highestScore: number;
    totalRuns: number;
    operatorRank: string;            // derived title
    overallRating: string;           // one-line summary of performance
}

// ============================================================
// ENDLESS SHIFT
// ============================================================

// The player's standing endless configuration — the same lever categories as
// the campaign, but adjusted live during a shift.
export type EndlessConfig = GameConfig;

export type IncidentId =
    | 'bot_swarm'
    | 'server_slowdown'
    | 'vip_rush'
    | 'public_surge'
    | 'accessibility_spike'
    | 'payment_delay'
    | 'queue_restart';

export interface IncidentDef {
    id: IncidentId;
    label: string;
    alert: string;               // short operational alert line
    durationTicks: number;       // how long it modifies the sim
    // Temporary additive pressure while active (0-1 scale contributions).
    botPressureAdd?: number;
    serverRiskAdd?: number;
    resalePressureAdd?: number;
    demandMult?: number;
    fairnessDrainAdd?: number;   // extra fairness drain per tick
    stabilityDrainAdd?: number;  // extra stability drain per tick
}

export interface ActiveIncident {
    id: IncidentId;
    label: string;
    alert: string;
    ticksRemaining: number;
}

// ---- Live Operational Decisions ----
// A short judgment call presented mid-shift. Deterministic: which decision
// appears, and when, is a pure function of the tick count.

export type DecisionId =
    | 'server_load'
    | 'bot_attack'
    | 'vip_demand'
    | 'accessibility_spike'
    | 'payment_latency'
    | 'resale_abuse';

// A temporary modifier a decision option applies to the running sim.
export interface DecisionEffect {
    label: string;               // e.g. "Less bots" / "More friction"
    good: boolean;               // ↓ green vs ↑ amber for the tradeoff row
}

export interface DecisionOption {
    id: 'yes' | 'no';
    label: string;               // button text
    // Temporary modifiers applied while the decision's effect is active.
    durationTicks: number;
    botBlockAdd?: number;        // +bot blocking (0-1)
    frictionAdd?: number;        // +checkout friction (0-1)
    stabilityDrainAdd?: number;  // + per-tick stability drain (negative = relief)
    fairnessDrainAdd?: number;
    patienceDrainAdd?: number;
    // Which option is the "correct" call for THIS scenario (deterministic).
    correct: boolean;
    tradeoffs: DecisionEffect[]; // shown as the ↓/↑ rows
    historyLabel: string;        // shown in the shift report ("Enabled aggressive verification")
}

export interface DecisionDef {
    id: DecisionId;
    alert: string;               // the operational prompt ("Server under heavy load.")
    question: string;            // ("Increase queue delay?")
    options: [DecisionOption, DecisionOption];  // exactly two: [yes, no]
}

// A decision currently on screen, with its expiry countdown.
export interface ActiveDecision {
    def: DecisionDef;
    ticksRemaining: number;      // expires when this hits 0 (counts as ignored)
}

// A modifier currently applied to the sim as a result of a taken decision.
export interface DecisionModifier {
    sourceId: DecisionId;
    ticksRemaining: number;
    botBlockAdd: number;
    frictionAdd: number;
    stabilityDrainAdd: number;
    fairnessDrainAdd: number;
    patienceDrainAdd: number;
}

export interface DecisionOutcome {
    decisionId: DecisionId;
    historyLabel: string;
    kind: 'correct' | 'wrong' | 'ignored';
    tick: number;
}

export interface DecisionTally {
    correct: number;
    wrong: number;
    ignored: number;
    longestCorrectStreak: number;
    currentCorrectStreak: number;
}

// A single frame of the endless simulation (one tick == one second of shift time).
export interface EndlessState {
    tick: number;                // seconds elapsed
    wave: number;                // current difficulty wave (1-based)
    stability: number;          // 0-100, shift ends at 0
    fairness: number;           // 0-100, shift ends at 0
    fanPatience: number;        // 0-100, shift ends at 0 (fans abandon)
    combo: number;              // current combo count
    highestCombo: number;
    fansServed: number;         // cumulative
    botsBlocked: number;        // cumulative
    operatorScore: number;      // cumulative score
    activeIncident: ActiveIncident | null;
    // Live decisions
    activeDecision: ActiveDecision | null;
    modifiers: DecisionModifier[];
    tally: DecisionTally;
    history: DecisionOutcome[];
    over: boolean;
    endReason: EndlessEndReason | null;
}

export type EndlessEndReason = 'stability' | 'fairness' | 'patience';

export interface EndlessRunResult {
    timeSurvived: number;        // ticks/seconds
    wavesReached: number;
    fansServed: number;
    botsBlocked: number;
    highestCombo: number;
    stability: number;
    fairness: number;
    operatorScore: number;
    endReason: EndlessEndReason;
    // Live decision outcomes
    decisionsCorrect: number;
    decisionsWrong: number;
    decisionsIgnored: number;
    longestCorrectStreak: number;
    history: DecisionOutcome[];
}

// Persisted endless records.
export interface EndlessRecord {
    longestShift: number;        // seconds
    highestScore: number;
    highestCombo: number;
    mostFansServed: number;
    bestStability: number;       // best stability at any shift end (survival quality)
    bestFairness: number;
    runs: number;
    lastPlayed: number;
    // Live decision aggregates (cumulative across all shifts)
    totalDecisionsCorrect: number;
    totalDecisionsWrong: number;
    totalDecisionsIgnored: number;
    bestCorrectStreak: number;
}

export interface EndlessImprovements {
    newLongestShift: boolean;
    newHighestScore: boolean;
    newHighestCombo: boolean;
    newMostFansServed: boolean;
    anyImprovement: boolean;
}
