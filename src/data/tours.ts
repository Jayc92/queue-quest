// Queue Quest — UI walkthrough step definitions.
//
// Each tour is an ordered list of steps. A step's `target` names a `data-tour`
// anchor attribute on a real DOM element in that screen — the tour engine
// spotlights the actual element (never an approximate arrow). Steps whose
// targets are absent (locked cards, conditional panels) are skipped safely.
// `target` may list fallback anchors (first one found wins) so desktop and
// mobile layouts can anchor the same step to different elements.
//
// Copy rules: max ~2 short sentences per step. These explain the INTERFACE —
// the Training Shift teaches gameplay and is not replaced by this.

import type { TourStep } from '../components/tour/UiTour';

export const HOME_TOUR: TourStep[] = [
    {
        title: 'Welcome to Queue Quest',
        body: 'You run ticket onsales for high-demand events: get real fans through, keep bots out, and keep the platform standing. This quick tour shows you around the interface.',
    },
    {
        target: 'home-pulse',
        title: 'Live Demand Pulse',
        body: 'This is the mood of the crowd already gathering. It\'s ambient flavor — the real numbers live inside each mission.',
    },
    {
        target: 'home-status',
        title: 'Status board',
        body: 'Four system readouts: fan Demand, ticket Inventory, Bot activity, and Server state. Red means pressure is waiting for you.',
    },
    {
        target: 'home-ready',
        title: 'System Ready',
        body: 'When this indicator is green, the command center is standing by.',
    },
    {
        target: 'home-enter',
        title: 'Enter Command Center',
        body: 'This button takes you to the Mission Board, where everything starts. First-time operators are offered a short Training Shift.',
    },
];

export const MISSION_BOARD_TOUR: TourStep[] = [
    {
        target: 'board-missions',
        title: 'Campaign missions',
        body: 'Five operations, from a small club show to a global tour. Clear a mission\'s target score to unlock the next one — locked cards show a padlock.',
    },
    {
        target: 'board-mission-card',
        title: 'Reading a mission card',
        body: 'Each card shows the threat level, the mission\'s primary concern, and the target score to beat. Once you\'ve played, your best score and medal appear on the right.',
    },
    {
        target: 'board-training',
        title: 'Training Shift',
        body: 'A guided, no-stakes rehearsal that teaches the gameplay levers. Replay it anytime.',
    },
    {
        target: 'board-daily',
        title: 'Daily Challenge',
        body: 'A fresh fictional venue and scenario every calendar day, playable immediately. Clear it to build a streak — your best daily score is saved on this device.',
    },
    {
        target: 'board-endless',
        title: 'Endless Shift',
        body: 'The post-campaign survival mode: pressure escalates until something breaks. It unlocks after all five campaign missions are cleared.',
    },
    {
        target: 'board-record',
        title: 'Operator Record',
        body: 'Your lifetime stats: highest score, missions cleared and mastered, and total runs.',
    },
];

export const BRIEFING_TOUR: TourStep[] = [
    {
        target: 'brief-story',
        title: 'The briefing',
        body: 'Situation, Threat Assessment, and Operational Goal describe what you\'re walking into and what success means.',
    },
    {
        target: 'brief-stats',
        title: 'Pressure readouts',
        body: 'Bot Threat, Resale Risk, and Server Risk are this mission\'s actual simulation inputs. High numbers here should shape your configuration.',
    },
    {
        target: 'brief-risks',
        title: 'Known Risks',
        body: 'The specific traps this mission punishes. Treat each line as a hint about which levers matter.',
    },
    {
        target: 'brief-scenario',
        title: 'Scenario Event',
        body: 'A pre-launch development unique to this mission — it genuinely changes the simulation, not just the story.',
    },
    {
        target: 'brief-success',
        title: 'Success Criteria',
        body: 'What a clear looks like in plain words.',
    },
    {
        target: 'brief-target',
        title: 'Target score',
        body: 'Reach this overall score to clear the mission. Beat it by enough and you\'ll earn Strong Clear or Mastered medals.',
    },
];

export const CONFIGURATION_TOUR: TourStep[] = [
    {
        target: 'config-timing',
        title: 'Queue Timing',
        body: 'When the waiting room opens and how entry is split into waves. Waves spread server load; the waiting room trades fan prep time against bot prep time.',
    },
    {
        target: 'config-defense',
        title: 'Identity & Bot Defense',
        body: 'Bot Detection and Fan Verification block automated buyers — but stronger settings add friction that slows real fans. Match them to the mission\'s bot threat.',
    },
    {
        target: 'config-purchase',
        title: 'Purchase Rules',
        body: 'The per-buyer ticket limit and resale policy. Tighter rules spread tickets more fairly; looser rules are friendlier to groups.',
    },
    {
        target: 'config-inventory',
        title: 'Inventory Allocation',
        body: 'How many seats are reserved for presale and accessible access before the public sale. Both relieve pressure — too much presale feels unfair.',
    },
    {
        target: ['config-projections', 'config-projections-mobile'],
        title: 'Live Projections',
        body: 'A forecast of your outcome that updates the instant you move any control. Green is good — tune here before you commit.',
    },
    {
        target: 'config-alerts',
        title: 'Inventory split & alerts',
        body: 'The seat breakdown and pre-launch warnings. Danger alerts name the metric they threaten — you can launch anyway, but you\'ve been told.',
    },
    {
        target: ['config-launch', 'config-launch-mobile'],
        title: 'Launch Onsale',
        body: 'Runs the simulation with your current settings. You can always adjust and relaunch after seeing the results.',
    },
];

export const RESULTS_TOUR: TourStep[] = [
    {
        target: 'results-score',
        title: 'Your score',
        body: 'The overall score against the mission target, with your medal. The bands above a clear are Strong Clear and Mastered.',
    },
    {
        target: 'results-metrics',
        title: 'The six metrics',
        body: 'These combine into your score. Tap or click any card to see exactly what it means and which of your choices caused it.',
    },
    {
        target: 'results-causes',
        title: 'How your choices played out',
        body: 'The biggest thing that helped, the biggest thing that hurt, and the single highest-impact change to try next.',
    },
    {
        target: 'results-trace',
        title: 'Simulation Trace',
        body: 'A play-by-play of the onsale: peak load, bot filtering, fans admitted, checkout.',
    },
    {
        target: 'results-debrief',
        title: 'Operations Debrief',
        body: 'Your best and most costly decisions this run, plus a recommended adjustment.',
    },
    {
        target: 'results-actions',
        title: 'What next',
        body: 'Adjust Setup keeps your settings for another try; Reset starts clean. Clearing a mission unlocks the next one.',
    },
];

export const ENDLESS_TOUR: TourStep[] = [
    {
        target: 'endless-header',
        title: 'Endless Shift',
        body: 'An open-ended operation: pressure escalates in waves until a survival meter collapses. There\'s no finish line — only how long you last.',
    },
    {
        target: 'endless-ends',
        title: 'How a shift ends',
        body: 'Three meters — Stability, Fairness, and Fan Patience — drain under pressure. When any one hits zero, the shift is over.',
    },
    {
        target: 'endless-records',
        title: 'Your records',
        body: 'Longest shift, highest score, best combo, and most fans served persist on this device.',
    },
    {
        target: 'endless-begin',
        title: 'Begin Shift',
        body: 'Adjust your levers live while incidents and decisions hit mid-shift. Good luck, operator.',
    },
];

export const DAILY_TOUR: TourStep[] = [
    {
        title: 'Daily Challenge',
        body: 'One fictional venue per calendar day — the same challenge all day, resetting at your local midnight. Replay as often as you like; your best score and streak are saved on this device.',
    },
];
