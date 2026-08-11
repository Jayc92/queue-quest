// Queue Quest — first-time UI walkthrough state.
//
// Tracks which interface tours the player has completed (or skipped) so each one
// auto-offers itself exactly once, the first time the player reaches that screen.
// Deliberately stored under its OWN LocalStorage key — separate from the game
// records store — so resetting gameplay records does not re-trigger every tour,
// and clearing tours never touches progression. The adapter never throws.
//
// This is the interface/navigation walkthrough. It is NOT the Training Shift
// (which teaches gameplay) and does not replace it.

export const UI_TOUR_STORAGE_KEY = 'queueQuest.uiTour.v1';
export const UI_TOUR_VERSION = 1 as const;

/** One flag per screen tour. Skipping counts as "seen" — we never re-force a tour. */
export type TourId =
    | 'home'          // Title screen
    | 'missionBoard'  // Mission Board / level select
    | 'briefing'      // Mission briefing
    | 'configuration' // Configuration console
    | 'results'       // Results / debrief
    | 'endless'       // Endless Shift entry (briefing screen, once unlocked)
    | 'daily';        // First Daily Challenge briefing (single step)

export const ALL_TOUR_IDS: readonly TourId[] = [
    'home', 'missionBoard', 'briefing', 'configuration', 'results', 'endless', 'daily',
];

export interface UiTourStore {
    version: 1;
    completed: Partial<Record<TourId, boolean>>;
}

export function createEmptyTourStore(): UiTourStore {
    return { version: UI_TOUR_VERSION, completed: {} };
}

/** Parse any raw value into a valid store. Unknown versions / corrupt data → fresh. */
export function parseTourStore(raw: unknown): UiTourStore {
    if (!raw || typeof raw !== 'object') return createEmptyTourStore();
    const obj = raw as Record<string, unknown>;
    if (obj.version !== UI_TOUR_VERSION) return createEmptyTourStore();
    const store = createEmptyTourStore();
    const completed = obj.completed;
    if (completed && typeof completed === 'object') {
        for (const id of ALL_TOUR_IDS) {
            if ((completed as Record<string, unknown>)[id] === true) store.completed[id] = true;
        }
    }
    return store;
}

// ---------- localStorage adapter (never throws) ----------

function getStorage(): Storage | null {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage;
    } catch {
        return null;
    }
}

export function loadTourStore(): UiTourStore {
    const storage = getStorage();
    if (!storage) return createEmptyTourStore();
    try {
        const raw = storage.getItem(UI_TOUR_STORAGE_KEY);
        if (!raw) return createEmptyTourStore();
        return parseTourStore(JSON.parse(raw));
    } catch {
        return createEmptyTourStore();
    }
}

export function isTourCompleted(id: TourId): boolean {
    return loadTourStore().completed[id] === true;
}

/** Mark a tour completed/skipped (both count — we never re-force). Persists immediately. */
export function markTourCompleted(id: TourId): void {
    const storage = getStorage();
    const store = loadTourStore();
    store.completed[id] = true;
    if (!storage) return;
    try {
        storage.setItem(UI_TOUR_STORAGE_KEY, JSON.stringify(store));
    } catch {
        // Quota/private mode — tour will re-offer next session; harmless.
    }
}
