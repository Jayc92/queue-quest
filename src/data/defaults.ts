import type {
    GameConfig,
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
    { value: 'low', label: 'Basic', shortDesc: 'CAPTCHA only' },
    { value: 'medium', label: 'Standard', shortDesc: 'Rate limits' },
    { value: 'high', label: 'Enhanced', shortDesc: 'Behavioral' },
    { value: 'aggressive', label: 'Maximum', shortDesc: 'ML + phone' },
];

export const VERIFICATION_OPTIONS: Option<Verification>[] = [
    { value: 'none', label: 'Open', shortDesc: 'No checks' },
    { value: 'basic', label: 'Email', shortDesc: 'Email verify' },
    { value: 'verified', label: 'ID Verify', shortDesc: 'Full identity' },
];

export const RESALE_OPTIONS: Option<ResalePolicy>[] = [
    { value: 'none', label: 'Open', shortDesc: 'No limits' },
    { value: 'caps', label: 'Cap', shortDesc: '120% max' },
    { value: 'face', label: 'Face Value', shortDesc: 'Original' },
    { value: 'no_resale', label: 'Locked', shortDesc: 'No transfer' },
];
