// Queue Quest — first-time UI walkthrough engine.
//
// Spotlights one REAL interface element at a time (matched via `data-tour`
// anchor attributes), dims everything else, and shows a small coach panel with
// Back / Next / Skip and a "3 of 7" progress readout. Steps whose anchors are
// absent (locked cards, responsive layouts) are skipped safely; a step with no
// target renders as a centered panel over a plain dim. Fully keyboard- and
// touch-operable, dialog semantics, focus restored on close, reduced-motion
// aware. This never traps: Skip and Escape always work.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface TourStep {
    /** data-tour anchor name(s); first found in the DOM wins. Omit for a centered step. */
    target?: string | string[];
    title: string;
    body: string;
}

interface UiTourProps {
    steps: TourStep[];
    /** completed=true only when the player pressed Finish on the last step. */
    onClose: (completed: boolean) => void;
    /**
     * Called instead of onClose when NO step is presentable (all anchors missing/
     * invisible — e.g. opened before the screen finished rendering). Callers should
     * close without marking the tour as seen, so it can offer itself again later.
     */
    onUnavailable?: () => void;
}

interface Rect { top: number; left: number; width: number; height: number }

const SPOT_PAD = 6;          // px of breathing room around the highlighted element
const PANEL_MARGIN = 12;     // px gap between spotlight and panel / viewport edges

function findTarget(target?: string | string[]): HTMLElement | null {
    if (!target) return null;
    const names = Array.isArray(target) ? target : [target];
    for (const name of names) {
        const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
        // Skip anchors that are rendered but invisible (e.g. responsive-hidden).
        if (el && el.offsetParent !== null && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
}

export function UiTour({ steps, onClose, onUnavailable }: UiTourProps) {
    // Resolve which steps are actually presentable right now. Centered steps
    // (no target) always qualify; anchored steps need a visible element.
    const active = useMemo(
        () => steps.filter(s => !s.target || findTarget(s.target) !== null),
        [steps],
    );

    const [idx, setIdx] = useState(0);
    const [spot, setSpot] = useState<Rect | null>(null);
    const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const prevFocus = useRef<Element | null>(null);
    const reduced = useMemo(
        () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        [],
    );

    const step = active[idx];
    const isLast = idx === active.length - 1;

    // Nothing presentable → bail out safely (never crash). This does NOT count as
    // seen — the tour should offer itself again once the screen actually renders.
    useEffect(() => {
        if (active.length === 0) (onUnavailable ?? (() => onClose(false)))();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active.length]);

    // Focus management: remember opener, focus the panel per step, restore on unmount.
    useEffect(() => {
        prevFocus.current = document.activeElement;
        return () => {
            const el = prevFocus.current;
            if (el instanceof HTMLElement) el.focus();
        };
    }, []);
    // Focus the panel once it is positioned & visible (a visibility:hidden element
    // can't receive focus). Re-measures update panelPos on scroll, so only steal
    // focus when it isn't already inside the panel (e.g. on a button).
    useEffect(() => {
        const panel = panelRef.current;
        if (!panel || !panelPos) return;
        if (!panel.contains(document.activeElement)) panel.focus();
    }, [idx, panelPos]);

    // Measure the current target (scrolling it into view first) and track it
    // through scrolls/resizes so the spotlight stays glued to the element.
    const measure = useCallback(() => {
        const el = findTarget(step?.target);
        if (!el) { setSpot(null); return; }
        const r = el.getBoundingClientRect();
        setSpot({ top: r.top - SPOT_PAD, left: r.left - SPOT_PAD, width: r.width + SPOT_PAD * 2, height: r.height + SPOT_PAD * 2 });
    }, [step]);

    useEffect(() => {
        if (!step) return;
        const el = findTarget(step.target);
        if (el) el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [step, measure, reduced]);

    // Place the panel below the spotlight when there's room, else above, else
    // centered; always clamped inside the viewport. Runs after render so the
    // real panel height is known.
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        const pw = panel.offsetWidth, ph = panel.offsetHeight;
        if (!spot) {
            setPanelPos({ top: Math.max(PANEL_MARGIN, (vh - ph) / 2), left: Math.max(PANEL_MARGIN, (vw - pw) / 2) });
            return;
        }
        const below = spot.top + spot.height + PANEL_MARGIN;
        const above = spot.top - PANEL_MARGIN - ph;
        let top: number;
        if (below + ph <= vh - PANEL_MARGIN) top = below;
        else if (above >= PANEL_MARGIN) top = above;
        else top = Math.max(PANEL_MARGIN, Math.min(vh - ph - PANEL_MARGIN, below));
        const left = Math.max(PANEL_MARGIN, Math.min(vw - pw - PANEL_MARGIN, spot.left + spot.width / 2 - pw / 2));
        setPanelPos({ top, left });
    }, [spot, idx]);

    const next = useCallback(() => {
        if (isLast) onClose(true);
        else setIdx(i => Math.min(active.length - 1, i + 1));
    }, [isLast, onClose, active.length]);
    const back = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
    const skip = useCallback(() => onClose(false), [onClose]);

    // Keyboard: Escape skips, arrows navigate, Tab stays inside the panel.
    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); skip(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); next(); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
        if (e.key === 'Tab') {
            const panel = panelRef.current;
            if (!panel) return;
            const focusables = panel.querySelectorAll<HTMLElement>('button');
            if (focusables.length === 0) return;
            const first = focusables[0], last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }, [skip, next, back]);

    if (!step) return null;

    return (
        <div className="qq-tour-root" onKeyDown={onKeyDown}>
            {/* Background lock: swallows clicks/taps while the tour is open. */}
            <div className="qq-tour-blocker" aria-hidden="true" />
            {/* Dim + spotlight: cutout via giant box-shadow around the target. */}
            {spot ? (
                <div
                    className="qq-tour-spotlight"
                    aria-hidden="true"
                    style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
                />
            ) : (
                <div className="qq-tour-dim" aria-hidden="true" />
            )}

            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="qq-tour-title"
                aria-describedby="qq-tour-body"
                tabIndex={-1}
                className={`qq-tour-panel ${reduced ? '' : 'animate-badge-pop'}`}
                style={panelPos ? { top: panelPos.top, left: panelPos.left, visibility: 'visible' } : { visibility: 'hidden' }}
            >
                {/* Screen-reader announcement of step + progress. */}
                <div aria-live="polite" className="sr-only">
                    Step {idx + 1} of {active.length}: {step.title}
                </div>
                <div className="flex items-center justify-between gap-2 mb-1">
                    <h2 id="qq-tour-title" className="text-sm font-bold text-white">{step.title}</h2>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0" aria-hidden="true">
                        {idx + 1} of {active.length}
                    </span>
                </div>
                <p id="qq-tour-body" className="text-xs text-slate-300 leading-snug mb-3">{step.body}</p>
                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={skip}
                        className="qq-press text-[11px] text-slate-500 hover:text-slate-300 py-1.5 px-1"
                    >
                        Skip Tour
                    </button>
                    <div className="flex items-center gap-2">
                        {idx > 0 && (
                            <button
                                onClick={back}
                                className="qq-press text-xs text-slate-300 py-2 px-3 rounded border border-slate-700 hover:border-slate-500"
                            >
                                Back
                            </button>
                        )}
                        <button
                            onClick={next}
                            className="qq-press text-xs font-bold py-2 px-4 rounded bg-cyan-500 hover:bg-cyan-400"
                            style={{ color: '#0a0e14' }}
                        >
                            {isLast ? 'Finish' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
