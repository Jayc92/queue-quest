// Queue Quest — shared display formatters.
//
// Small, pure helpers used across screens. Consolidated here so the same logic
// isn't re-declared per component.

// Format a number of seconds as M:SS (e.g. 75 → "1:15"). Used for shift times.
export function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
