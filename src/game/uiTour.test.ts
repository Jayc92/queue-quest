import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    UI_TOUR_STORAGE_KEY,
    ALL_TOUR_IDS,
    createEmptyTourStore,
    parseTourStore,
    loadTourStore,
    markTourCompleted,
    isTourCompleted,
} from './uiTour';

// In-memory localStorage stub (same pattern as records.test.ts).
class MemoryStorage {
    private map = new Map<string, string>();
    getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
    setItem(k: string, v: string) { this.map.set(k, v); }
    removeItem(k: string) { this.map.delete(k); }
}

function installStorage(): MemoryStorage {
    const mem = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: mem });
    return mem;
}

beforeEach(() => vi.unstubAllGlobals());

describe('uiTour store — parsing & recovery', () => {
    it('fresh store has no completed tours', () => {
        const s = createEmptyTourStore();
        for (const id of ALL_TOUR_IDS) expect(s.completed[id]).toBeUndefined();
    });

    it('corrupt / non-object / wrong-version data recovers to a fresh store', () => {
        expect(parseTourStore(null).completed).toEqual({});
        expect(parseTourStore('junk').completed).toEqual({});
        expect(parseTourStore({ version: 99, completed: { home: true } }).completed).toEqual({});
    });

    it('ignores unknown tour ids and non-boolean values', () => {
        const s = parseTourStore({ version: 1, completed: { home: true, bogus: true, results: 'yes' } });
        expect(s.completed.home).toBe(true);
        expect((s.completed as Record<string, unknown>).bogus).toBeUndefined();
        expect(s.completed.results).toBeUndefined();
    });
});

describe('uiTour store — persistence', () => {
    it('markTourCompleted persists and round-trips through loadTourStore', () => {
        const mem = installStorage();
        expect(isTourCompleted('home')).toBe(false);
        markTourCompleted('home');
        expect(isTourCompleted('home')).toBe(true);
        expect(isTourCompleted('missionBoard')).toBe(false);
        // Raw persisted payload is valid JSON under the versioned key.
        const raw = JSON.parse(mem.getItem(UI_TOUR_STORAGE_KEY)!);
        expect(raw.version).toBe(1);
        expect(raw.completed.home).toBe(true);
    });

    it('marking multiple tours accumulates (does not overwrite others)', () => {
        installStorage();
        markTourCompleted('home');
        markTourCompleted('daily');
        const s = loadTourStore();
        expect(s.completed.home).toBe(true);
        expect(s.completed.daily).toBe(true);
    });

    it('corrupt storage never throws and reads as fresh', () => {
        const mem = installStorage();
        mem.setItem(UI_TOUR_STORAGE_KEY, '{ not json');
        expect(() => loadTourStore()).not.toThrow();
        expect(isTourCompleted('home')).toBe(false);
    });

    it('no window (node) → safe defaults, no throw', () => {
        expect(() => markTourCompleted('home')).not.toThrow();
        expect(isTourCompleted('home')).toBe(false);
    });

    it('uses its own key, separate from game records', () => {
        expect(UI_TOUR_STORAGE_KEY).toBe('queueQuest.uiTour.v1');
        expect(UI_TOUR_STORAGE_KEY).not.toContain('records');
    });
});
