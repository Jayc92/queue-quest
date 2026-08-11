// Queue Quest — Daily Challenge generator.
//
// One fictional onsale per local calendar day. Generation is FULLY DETERMINISTIC:
// the "YYYY-MM-DD" date key seeds a small PRNG, so the same date always produces
// the identical challenge on the same game version (no backend, no Math.random()).
// The challenge resets at the player's LOCAL midnight (see dateUtils.ts).
//
// Design guarantees (enforced by daily.test.ts across hundreds of sampled dates):
//   * Capacity is one of nine tiers from an 800-seat club to a 100,000-seat
//     college-football-scale stadium. All venue/event names are fictional.
//   * Demand always exceeds capacity; ratios stay in a sane band unless the
//     explicitly-labeled "viral demand" modifier fires.
//   * Every challenge is ACHIEVABLE BY CONSTRUCTION: the target score is derived
//     from what a curated set of strong candidate configs actually scores on the
//     generated level, minus a margin (balance.DAILY) — never from guesswork.
//   * 1–2 special modifiers per day, each of which genuinely affects the
//     simulation (pressure/demand/short-notice modeling), never flavor-only.

import type { Level, LevelId, GameConfig, LevelWeights, ThreatLevel, IconName } from './types';
import { runSimulation } from './simulation';
import { DAILY } from './balance';

// ============================================================
// Seeded PRNG — xmur3 string hash → mulberry32. Deterministic, well-distributed.
// ============================================================

function hashSeed(str: string): number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const range = (rng: () => number, min: number, max: number) => min + rng() * (max - min);

// ============================================================
// Venue tiers — all fictional. Capacity spans 800 → 100,000 per the spec.
// ============================================================

interface VenueTier {
    capacity: number;
    type: string;               // display noun ("club", "arena", …)
    suffixes: readonly string[]; // fictional venue-name suffixes for this tier
    icon: IconName;
    sizeClass: 'small' | 'mid' | 'large';
}

const VENUE_TIERS: readonly VenueTier[] = [
    { capacity: 800,     type: 'club',             suffixes: ['Room', 'Club', 'Basement'],          icon: 'Building', sizeClass: 'small' },
    { capacity: 1500,    type: 'theater',          suffixes: ['Theater', 'Playhouse'],              icon: 'Building', sizeClass: 'small' },
    { capacity: 3000,    type: 'hall',             suffixes: ['Hall', 'Auditorium'],                icon: 'Building', sizeClass: 'small' },
    { capacity: 8000,    type: 'amphitheater',     suffixes: ['Amphitheater', 'Pavilion'],          icon: 'Music',    sizeClass: 'mid' },
    { capacity: 15000,   type: 'arena',            suffixes: ['Arena', 'Coliseum'],                 icon: 'Stadium',  sizeClass: 'mid' },
    { capacity: 25000,   type: 'festival grounds', suffixes: ['Festival Grounds', 'Fairgrounds'],   icon: 'Music',    sizeClass: 'mid' },
    { capacity: 40000,   type: 'stadium',          suffixes: ['Stadium', 'Park'],                   icon: 'Stadium',  sizeClass: 'large' },
    { capacity: 65000,   type: 'football stadium', suffixes: ['Stadium', 'Field'],                  icon: 'Stadium',  sizeClass: 'large' },
    { capacity: 100000,  type: 'college football stadium', suffixes: ['Stadium', 'Bowl'],           icon: 'Star',     sizeClass: 'large' },
];

// Fictional, neutral name stems — no real venues, teams, schools, or sponsors.
const NAME_STEMS = [
    'Harbor', 'Northline', 'Meridian', 'Summit', 'Grandview', 'Ironwood',
    'Cobalt', 'Ashford', 'Silverline', 'Redbrick', 'Lakemont', 'Halcyon',
    'Vantage', 'Stonegate', 'Brightwater', 'Foxhollow', 'Windmere', 'Copperfield',
    'Eastgate', 'Palisade', 'Clearwater', 'Oakhaven', 'Crestline', 'Bluffside',
] as const;

// Fictional event archetypes, matched to venue size so combinations stay sensible
// (no stadium production in an 800-seat club). No real artists/tours/leagues.
const EVENT_TYPES: Record<VenueTier['sizeClass'], readonly string[]> = {
    small: [
        'Breakout artist club show',
        'High-demand comedy tour stop',
        'One-night special engagement',
        'Reunion tour warm-up show',
        'Cult-favorite band homecoming',
    ],
    mid: [
        'Major touring artist onsale',
        'Reunion tour',
        'Multi-act festival day',
        'Family spectacular',
        'High-demand comedy tour stop',
    ],
    large: [
        'Stadium touring production',
        'Major touring artist stadium onsale',
        'Championship celebration event',
        'Multi-act mega-festival',
        'Farewell tour finale',
    ],
};

// ============================================================
// Special daily modifiers — every entry changes real simulation inputs.
// ============================================================

export type DailyModifierId = 'bot_surge' | 'resale_frenzy' | 'fragile_servers' | 'viral_demand' | 'short_notice';

interface DailyModifierDef {
    id: DailyModifierId;
    label: string;
    rule: string;    // player-facing special-rule line
}

const MODIFIER_POOL: readonly DailyModifierDef[] = [
    { id: 'bot_surge',       label: 'Bot-heavy traffic',      rule: 'Coordinated bot fleets are targeting this onsale — bot pressure is sharply elevated.' },
    { id: 'resale_frenzy',   label: 'High resale pressure',   rule: 'Scalper networks are staged to flip inventory — resale pressure is sharply elevated.' },
    { id: 'fragile_servers', label: 'Server-constrained venue', rule: 'This venue runs on limited infrastructure — server risk is sharply elevated.' },
    { id: 'viral_demand',    label: 'Viral demand anomaly',   rule: 'The event went viral overnight — demand is far beyond anything this venue has seen.' },
    { id: 'short_notice',    label: 'Short-notice onsale',    rule: 'Tickets go on sale with almost no lead time — long waiting rooms backfire today.' },
];

// ============================================================
// Weight archetypes (mirrors campaign mission weighting styles).
// ============================================================

const WEIGHTS: Record<'community' | 'infrastructure' | 'fairness' | 'balanced', LevelWeights> = {
    community:      { fans: 0.28, bots: 0.10, checkout: 0.15, satisfaction: 0.20, stability: 0.10, fairness: 0.17 },
    infrastructure: { fans: 0.22, bots: 0.18, checkout: 0.18, satisfaction: 0.16, stability: 0.15, fairness: 0.11 },
    fairness:       { fans: 0.20, bots: 0.15, checkout: 0.15, satisfaction: 0.15, stability: 0.15, fairness: 0.20 },
    balanced:       { fans: 0.18, bots: 0.18, checkout: 0.15, satisfaction: 0.15, stability: 0.17, fairness: 0.17 },
};

// ============================================================
// Target solver — curated strong configs spanning distinct strategies. The
// target is best-candidate-score minus DAILY.targetMargin, so at least one
// (usually several) sensible setups clear every generated challenge.
// ============================================================

export const DAILY_CANDIDATE_CONFIGS: readonly GameConfig[] = [
    { botDetection: 'high',       verification: 'basic',    purchaseLimit: 2, resale: 'face', waveCount: 2, waveInterval: 15, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 6 },
    { botDetection: 'high',       verification: 'basic',    purchaseLimit: 4, resale: 'caps', waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 25, accessiblePercent: 5 },
    { botDetection: 'high',       verification: 'basic',    purchaseLimit: 4, resale: 'caps', waveCount: 4, waveInterval: 20, waitingRoomTime: 3, presalePercent: 20, accessiblePercent: 8 },
    { botDetection: 'high',       verification: 'verified', purchaseLimit: 2, resale: 'face', waveCount: 3, waveInterval: 20, waitingRoomTime: 1, presalePercent: 30, accessiblePercent: 5 },
    { botDetection: 'high',       verification: 'verified', purchaseLimit: 2, resale: 'face', waveCount: 4, waveInterval: 20, waitingRoomTime: 2, presalePercent: 25, accessiblePercent: 8 },
    { botDetection: 'aggressive', verification: 'basic',    purchaseLimit: 1, resale: 'face', waveCount: 4, waveInterval: 20, waitingRoomTime: 1, presalePercent: 40, accessiblePercent: 12 },
    { botDetection: 'medium',     verification: 'basic',    purchaseLimit: 2, resale: 'face', waveCount: 3, waveInterval: 20, waitingRoomTime: 2, presalePercent: 20, accessiblePercent: 8 },
    { botDetection: 'high',       verification: 'basic',    purchaseLimit: 1, resale: 'face', waveCount: 2, waveInterval: 20, waitingRoomTime: 1, presalePercent: 40, accessiblePercent: 12 },
    { botDetection: 'aggressive', verification: 'basic',    purchaseLimit: 2, resale: 'face', waveCount: 2, waveInterval: 20, waitingRoomTime: 1, presalePercent: 30, accessiblePercent: 10 },
    { botDetection: 'high',       verification: 'none',     purchaseLimit: 2, resale: 'caps', waveCount: 3, waveInterval: 20, waitingRoomTime: 2, presalePercent: 15, accessiblePercent: 8 },
];

// ============================================================
// Public shape
// ============================================================

export interface DailyChallenge {
    dateKey: string;             // "YYYY-MM-DD" (local calendar) — also the id
    title: string;               // "Reunion Tour — Meridian Arena"
    venueName: string;           // fictional
    venueType: string;
    eventType: string;
    capacity: number;
    demand: number;
    demandRatio: number;         // demand / capacity, rounded
    targetScore: number;
    modifierIds: DailyModifierId[];
    specialRules: string[];      // player-facing modifier lines (1–2)
    /** Ready-to-play level. Its scenario entry is descriptive only (modifier
     *  effects are already baked into the level params), so applyScenario is a
     *  no-op for daily levels — the numbers shown ARE the numbers simulated. */
    level: Level;
}

export function generateDailyChallenge(dateKey: string): DailyChallenge {
    const rng = mulberry32(hashSeed(`queueQuest.daily.${dateKey}`));

    // --- Venue & event ---
    const tier = pick(rng, VENUE_TIERS);
    const stem = pick(rng, NAME_STEMS);
    const venueName = `${stem} ${pick(rng, tier.suffixes)}`;
    const eventType = pick(rng, EVENT_TYPES[tier.sizeClass]);

    // --- Modifiers: always 1, sometimes 2 (distinct). Picked before pressures so
    //     their effects bake into the level parameters below. ---
    const first = pick(rng, MODIFIER_POOL);
    const wantSecond = rng() < 0.4;
    let second: DailyModifierDef | null = null;
    if (wantSecond) {
        const rest = MODIFIER_POOL.filter(m => m.id !== first.id);
        second = pick(rng, rest);
    }
    const modifiers = second ? [first, second] : [first];
    const has = (id: DailyModifierId) => modifiers.some(m => m.id === id);

    // --- Demand ---
    // Base scarcity band; the viral modifier pushes into a labeled anomaly band
    // (this is the ONLY way an 800-seat club sees outsized demand).
    const ratio = has('viral_demand')
        ? range(rng, DAILY.viralRatioMin, DAILY.viralRatioMax)
        : range(rng, DAILY.ratioMin, DAILY.ratioMax);
    const demand = Math.round(tier.capacity * ratio / 100) * 100 || tier.capacity * 2;
    const demandRatio = Math.round(demand / tier.capacity);

    // --- Pressures (0–1), modifier-boosted, clamped so nothing is unwinnable ---
    const clamp01 = (v: number) => Math.min(0.95, Math.max(0.1, v));
    const botPressure = clamp01(range(rng, 0.15, 0.6) + (has('bot_surge') ? 0.25 : 0));
    const resalePressure = clamp01(range(rng, 0.25, 0.7) + (has('resale_frenzy') ? 0.25 : 0));
    // Server risk scales with scarcity (heavier crush = more load) plus venue luck.
    const serverRisk = clamp01(0.15 + demandRatio / 60 + range(rng, 0, 0.25) + (has('fragile_servers') ? 0.25 : 0));

    // --- Identity: threat level & primary concern derive from the actual numbers ---
    const maxPressure = Math.max(botPressure, resalePressure, serverRisk);
    const avgPressure = (botPressure + resalePressure + serverRisk) / 3;
    const threatLevel: ThreatLevel =
        avgPressure < 0.3 ? 'Low' : avgPressure < 0.42 ? 'Moderate' : avgPressure < 0.55 ? 'High' : avgPressure < 0.7 ? 'Severe' : 'Critical';
    const primaryConcern =
        maxPressure === serverRisk ? 'Server Stability'
        : maxPressure === resalePressure ? 'Resale Pressure'
        : 'Bot Defense';
    const weights =
        tier.sizeClass === 'small' ? WEIGHTS.community
        : primaryConcern === 'Server Stability' ? WEIGHTS.infrastructure
        : primaryConcern === 'Resale Pressure' ? WEIGHTS.fairness
        : WEIGHTS.balanced;

    // level.id 4 activates the sim's real short-notice modeling (long waiting
    // rooms help bots; resale satisfaction shifts). All other daily levels use a
    // neutral id with no mission-specific special cases.
    const levelId: LevelId = has('short_notice') ? 4 : 2;

    const specialRules = modifiers.map(m => m.rule);

    // --- Briefing copy (all fictional) ---
    const situation = `${eventType} at ${venueName} — ${tier.capacity.toLocaleString()} seats, roughly ${demand.toLocaleString()} fans expected in the queue (${demandRatio}:1).`;
    const threatAssessment = `${modifiers.map(m => m.label).join(' and ')} define${modifiers.length === 1 ? 's' : ''} today's operation. ` +
        (primaryConcern === 'Server Stability' ? 'Infrastructure is the weak point — watch load above all.'
        : primaryConcern === 'Resale Pressure' ? 'The secondary market is circling — fairness controls carry the day.'
        : 'Automated traffic is the main threat — defense settings carry the day.');

    const level: Level = {
        id: levelId,
        name: venueName,
        subtitle: eventType,
        description: situation,
        seats: tier.capacity,
        demand,
        botPressure: round2(botPressure),
        resalePressure: round2(resalePressure),
        serverRisk: round2(serverRisk),
        parScore: 0, // filled by the solver below
        icon: tier.icon,
        threatProfile: `Daily Challenge / ${modifiers.map(m => m.label).join(' + ')}`,
        constraint: specialRules[0],
        weights,
        identity: {
            threatLevel,
            primaryConcern,
            missionType: 'Daily Challenge',
            briefing: {
                situation,
                threatAssessment,
                operationalGoal: 'One shot at today\'s board — configure for this venue\'s specific pressures and beat the target.',
                knownRisks: specialRules,
                successCriteria: 'Reach today\'s target score. Replays are allowed; your best score for the day is saved locally.',
            },
            // Descriptive only — no multipliers. Daily modifier effects are already
            // baked into the level params above, so applyScenario() is identity here.
            scenario: {
                id: `daily-${modifiers[0].id}`,
                label: modifiers.map(m => m.label).join(' + '),
                detail: specialRules.join(' '),
                severity: avgPressure >= 0.5 ? 'danger' : 'warning',
            },
            resultSummary: {
                strong: 'A commanding run — today\'s board bows to you.',
                pass: 'Target cleared. Today\'s challenge is complete.',
                fail: 'Short of today\'s target — adjust for this venue\'s specific pressures and replay.',
            },
        },
    };

    // --- Target: achievable by construction ---
    const best = Math.max(...DAILY_CANDIDATE_CONFIGS.map(c => runSimulation(level, c).overallScore));
    const clamped = Math.max(DAILY.targetMin, Math.min(DAILY.targetMax, Math.round(best - DAILY.targetMargin)));
    // Achievability always wins over the clamp floor: on a brutal-ceiling day the
    // target drops below targetMin rather than ever exceeding what's reachable.
    const targetScore = Math.min(clamped, best - 2);
    level.parScore = targetScore;

    return {
        dateKey,
        title: `${eventType} — ${venueName}`,
        venueName,
        venueType: tier.type,
        eventType,
        capacity: tier.capacity,
        demand,
        demandRatio,
        targetScore,
        modifierIds: modifiers.map(m => m.id),
        specialRules,
        level,
    };
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}
