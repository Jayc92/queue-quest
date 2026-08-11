// Queue Quest — debug control bridge.
//
// A tiny observable shared between the Debug Panel and the live Endless Shift.
// It lets developer-only toggles (suppress incidents, force a collapse) reach the
// running simulation WITHOUT threading props through normal gameplay code or
// touching the pure engine. In normal play the panel never mounts, so these flags
// stay at their defaults and nothing reads them meaningfully.
//
// This is intentionally a module singleton (not React state): the debug panel and
// the shift screen live in different subtrees, and this avoids a context provider
// purely for a dev tool.

export interface DebugFlags {
    /** When true, the Endless Shift screen skips applying incident modifiers. */
    suppressIncidents: boolean;
    /** Monotonic counter; incrementing it signals "force the current shift to collapse now". */
    forceCollapseNonce: number;
}

const flags: DebugFlags = {
    suppressIncidents: false,
    forceCollapseNonce: 0,
};

type Listener = (f: DebugFlags) => void;
const listeners = new Set<Listener>();

export function getDebugFlags(): DebugFlags {
    return flags;
}

export function setSuppressIncidents(v: boolean): void {
    flags.suppressIncidents = v;
    emit();
}

/** Request that the active shift end immediately (dev QA). */
export function requestForceCollapse(): void {
    flags.forceCollapseNonce += 1;
    emit();
}

export function subscribeDebug(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

function emit(): void {
    for (const fn of listeners) {
        try { fn(flags); } catch { /* a listener must never break the app */ }
    }
}
