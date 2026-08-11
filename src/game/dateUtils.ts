// Queue Quest — local calendar-date utilities for the Daily Challenge.
//
// The daily challenge resets at the PLAYER'S LOCAL MIDNIGHT, so all keys are
// derived from local calendar fields (getFullYear/getMonth/getDate), never UTC.
// Two players in different timezones may therefore see different challenges at
// the same instant — that is intentional and documented in the README.
//
// A date key is always "YYYY-MM-DD".

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local-calendar date key for a Date instance (defaults to "now"). */
export function localDateKey(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Parse a "YYYY-MM-DD" key into a local-midnight Date, or null if malformed. */
export function parseDateKey(key: string): Date | null {
    const m = KEY_RE.exec(key);
    if (!m) return null;
    const [, y, mo, d] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    // Reject impossible dates like 2026-02-31 (Date would roll them over).
    if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
        return null;
    }
    return date;
}

/** The key for the calendar day immediately before `key` (local calendar). */
export function previousDateKey(key: string): string | null {
    const d = parseDateKey(key);
    if (!d) return null;
    d.setDate(d.getDate() - 1);
    return localDateKey(d);
}

/**
 * True when `laterKey` is exactly the calendar day after `earlierKey`.
 * Used for streak logic: clearing on consecutive local days extends a streak.
 */
export function isNextCalendarDay(earlierKey: string, laterKey: string): boolean {
    const prev = previousDateKey(laterKey);
    return prev !== null && prev === earlierKey;
}
