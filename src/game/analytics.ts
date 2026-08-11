// Queue Quest — analytics event interface.
//
// A lightweight, no-backend event bus. Gameplay code calls `track(event, props)`
// at meaningful moments; by default this is a no-op. A real analytics backend
// (or a dev console logger) can be registered later via `setAnalyticsSink`
// WITHOUT touching any call site — exactly like the audio hook (`audio.ts`).
//
// Design goals:
//   * Zero coupling: the game never imports an SDK; it only emits typed events.
//   * Never throws: a broken sink must never break gameplay.
//   * No PII, no network here — this file just fans events out to a sink.

export type AnalyticsEvent =
    | 'app_started'
    | 'training_started'
    | 'training_completed'
    | 'training_skipped'
    | 'mission_started'
    | 'mission_completed'    // passed
    | 'mission_failed'       // did not reach par
    | 'mastery_earned'       // mission reached MASTERED for the first time
    | 'record_broken'        // any personal best improved on a run
    | 'campaign_completed'   // all five missions cleared
    | 'endless_started'
    | 'endless_ended'
    | 'decision_taken'       // player answered a live decision
    | 'decision_ignored'     // a live decision expired unanswered
    | 'records_reset';

// Freeform, JSON-serialisable properties. Kept loose on purpose so call sites can
// attach context (level id, score, rank, reason…) without a schema churn per event.
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsRecord {
    event: AnalyticsEvent;
    props: AnalyticsProps;
    /** Epoch ms, injected by the caller (kept out of this module so it stays pure/testable). */
    at?: number;
}

export type AnalyticsSink = (record: AnalyticsRecord) => void;

// Default sink is a no-op. Module-private and swappable.
let sink: AnalyticsSink = () => {};

/** Register a real analytics backend later (e.g. a batching HTTP client, or console). Optional. */
export function setAnalyticsSink(next: AnalyticsSink): void {
    sink = next;
}

/** Reset to the default no-op sink (used by tests and teardown). */
export function clearAnalyticsSink(): void {
    sink = () => {};
}

/**
 * Emit a gameplay analytics event. Safe to call anywhere; never throws.
 * `at` is optional — pass `Date.now()` from the UI layer if you want timestamps;
 * omitting it keeps callers deterministic/testable.
 */
export function track(event: AnalyticsEvent, props: AnalyticsProps = {}, at?: number): void {
    try {
        sink({ event, props, at });
    } catch {
        // An analytics backend must never break gameplay.
    }
}

// The full catalogue of events, exported for tooling/tests/future dashboards.
export const ANALYTICS_EVENTS: readonly AnalyticsEvent[] = [
    'app_started',
    'training_started', 'training_completed', 'training_skipped',
    'mission_started', 'mission_completed', 'mission_failed',
    'mastery_earned', 'record_broken', 'campaign_completed',
    'endless_started', 'endless_ended',
    'decision_taken', 'decision_ignored',
    'records_reset',
];
