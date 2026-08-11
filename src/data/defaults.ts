import type {
    GameConfig,
    Level,
    Option,
    BotDetection,
    Verification,
    ResalePolicy,
} from '../game/types';

export const DEFAULT_CONFIG: GameConfig = {
    waitingRoomTime: 2,       // Lever 1: Waiting room opening time
    botDetection: 'medium',   // Lever 2: Bot detection strength
    verification: 'basic',    // Lever 3: Fan verification
    purchaseLimit: 4,         // Lever 4: Purchase limits
    resale: 'caps',           // Lever 5: Resale restrictions
    waveCount: 1,             // Lever 6a: Staggered entry — wave count
    waveInterval: 15,         // Lever 6b: Staggered entry — wave interval (sub-control)
    accessiblePercent: 5,     // Lever 7: Accessible seating priority
    presalePercent: 20,       // Lever 8: VIP / presale allocation
};

export const BOT_DETECTION_OPTIONS: Option<BotDetection>[] = [
    { value: 'low', label: 'Basic', shortDesc: 'CAPTCHA' },
    { value: 'medium', label: 'Standard', shortDesc: 'Rate limits' },
    { value: 'high', label: 'Enhanced', shortDesc: 'Behavior AI' },
    { value: 'aggressive', label: 'Maximum', shortDesc: 'Full screening' },
];

export const VERIFICATION_OPTIONS: Option<Verification>[] = [
    { value: 'none', label: 'Open', shortDesc: 'No checks' },
    { value: 'basic', label: 'Email', shortDesc: 'Email verify' },
    { value: 'verified', label: 'ID Verify', shortDesc: 'Photo ID' },
];

export const RESALE_OPTIONS: Option<ResalePolicy>[] = [
    { value: 'none', label: 'Open', shortDesc: 'Any price' },
    { value: 'caps', label: 'Cap', shortDesc: 'Max +20%' },
    { value: 'face', label: 'Face Value', shortDesc: 'Same price' },
    { value: 'no_resale', label: 'Locked', shortDesc: 'No resale' },
];

// A deliberately gentle level used ONLY by the Training Shift so the tutorial can
// reuse the real PressureHUD / QueueTraffic / projections (learning transfers
// directly to the campaign console). Low pressure across the board + a very low
// par make it near-impossible to fail — the point is to teach, not to test. It is
// NOT part of LEVELS, so it never affects campaign unlocks, records, or par maps.
export const TRAINING_LEVEL: Level = {
    id: 1,
    name: 'Training Shift',
    subtitle: 'Rehearsal Onsale',
    description: 'A low-stakes rehearsal to learn the console before the real campaign.',
    seats: 5000,
    demand: 20000,
    botPressure: 0.20,
    resalePressure: 0.25,
    serverRisk: 0.25,
    parScore: 45,
    icon: 'Play',
    threatProfile: 'Training / No Real Stakes',
    constraint: 'A safe rehearsal — experiment freely.',
    weights: { fans: 0.28, bots: 0.12, checkout: 0.15, satisfaction: 0.18, stability: 0.12, fairness: 0.15 },
    identity: {
        threatLevel: 'Low',
        primaryConcern: 'Learning the Console',
        missionType: 'Training',
        briefing: {
            situation: 'A rehearsal onsale with the pressure turned down.',
            threatAssessment: 'Minimal threats. Nothing here can go badly wrong.',
            operationalGoal: 'Learn what each control does and how to read the results.',
            knownRisks: ['None — experiment freely'],
            successCriteria: 'Launch the onsale and read the debrief.',
        },
        scenario: {
            id: 'training-calm',
            label: 'Calm rehearsal',
            detail: 'No anomalies. A clean environment to learn the controls.',
            severity: 'warning',
        },
        resultSummary: {
            strong: 'Training complete — you have the fundamentals. The campaign awaits.',
            pass: 'Training complete — you have the fundamentals. The campaign awaits.',
            fail: 'Training complete — you have the fundamentals. The campaign awaits.',
        },
    },
};
