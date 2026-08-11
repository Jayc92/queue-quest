import { useEffect, useRef, useState } from 'react';

// Animate a number from 0 up to `target` over `durationMs`.
// Respects prefers-reduced-motion (snaps straight to the target).
// Uses requestAnimationFrame; cleans up on unmount / target change.
export function useCountUp(target: number, durationMs = 700, startDelayMs = 0): number {
    const [value, setValue] = useState(0);
    const rafRef = useRef<number | null>(null);
    const startRef = useRef<number | null>(null);

    useEffect(() => {
        const reduced = typeof window !== 'undefined'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced || target <= 0) {
            setValue(target);
            return;
        }

        let delayTimer: ReturnType<typeof setTimeout> | undefined;

        const tick = (now: number) => {
            if (startRef.current === null) startRef.current = now;
            const elapsed = now - startRef.current;
            const t = Math.min(1, elapsed / durationMs);
            // easeOutCubic
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(Math.round(target * eased));
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                setValue(target);
            }
        };

        const begin = () => {
            startRef.current = null;
            rafRef.current = requestAnimationFrame(tick);
        };

        if (startDelayMs > 0) {
            setValue(0);
            delayTimer = setTimeout(begin, startDelayMs);
        } else {
            begin();
        }

        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            if (delayTimer) clearTimeout(delayTimer);
        };
    }, [target, durationMs, startDelayMs]);

    return value;
}
