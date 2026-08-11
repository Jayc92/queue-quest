import { describe, it, expect, afterEach } from 'vitest';
import {
    track, setAnalyticsSink, clearAnalyticsSink, ANALYTICS_EVENTS,
    type AnalyticsRecord, type AnalyticsEvent,
} from './analytics';

afterEach(() => clearAnalyticsSink());

describe('analytics interface', () => {
    it('is a no-op by default (no throw, nothing observed)', () => {
        expect(() => track('mission_started', { levelId: 1 })).not.toThrow();
    });

    it('delivers events + props to a registered sink', () => {
        const seen: AnalyticsRecord[] = [];
        setAnalyticsSink(r => seen.push(r));
        track('mission_completed', { levelId: 2, score: 70 }, 1234);
        expect(seen).toHaveLength(1);
        expect(seen[0].event).toBe('mission_completed');
        expect(seen[0].props).toEqual({ levelId: 2, score: 70 });
        expect(seen[0].at).toBe(1234);
    });

    it('defaults props to an empty object when omitted', () => {
        let rec: AnalyticsRecord | null = null;
        setAnalyticsSink(r => { rec = r; });
        track('endless_started');
        expect(rec!.props).toEqual({});
        expect(rec!.at).toBeUndefined();
    });

    it('never throws even if the sink throws', () => {
        setAnalyticsSink(() => { throw new Error('sink boom'); });
        expect(() => track('record_broken', { levelId: 1 })).not.toThrow();
    });

    it('clearAnalyticsSink restores the no-op sink', () => {
        const seen: AnalyticsRecord[] = [];
        setAnalyticsSink(r => seen.push(r));
        clearAnalyticsSink();
        track('mastery_earned', { levelId: 3 });
        expect(seen).toHaveLength(0);
    });

    it('exports every declared event in the catalogue (no dupes)', () => {
        const unique = new Set<AnalyticsEvent>(ANALYTICS_EVENTS);
        expect(unique.size).toBe(ANALYTICS_EVENTS.length);
        // Spot-check a few required-by-spec events exist.
        for (const e of ['mission_started', 'mission_completed', 'mission_failed',
            'endless_started', 'decision_taken', 'decision_ignored',
            'training_completed', 'record_broken', 'mastery_earned'] as AnalyticsEvent[]) {
            expect(ANALYTICS_EVENTS).toContain(e);
        }
    });
});
