// Queue Quest — per-screen walkthrough mount.
//
// Drop one <ScreenTour> into a screen and it handles everything: auto-offering
// the tour the FIRST time the player reaches that screen (tracked in
// queueQuest.uiTour.v1), never re-forcing it after completion or skip, and
// rendering a small fixed "?" Help control so any tour can be replayed later.

import { useEffect, useState } from 'react';
import type { TourId } from '../../game/uiTour';
import { isTourCompleted, markTourCompleted } from '../../game/uiTour';
import { UiTour, type TourStep } from './UiTour';

interface ScreenTourProps {
    tourId: TourId;
    steps: TourStep[];
    /** Delay before the first-time auto-offer, so the screen paints/reveals first. */
    autoDelayMs?: number;
    /** Lift the Help button above bottom-fixed bars (e.g. the config mobile drawer). */
    helpBottomPx?: number;
    /** Hide the replay Help control (used for one-shot micro-tours like Daily). */
    hideHelp?: boolean;
}

export function ScreenTour({ tourId, steps, autoDelayMs = 600, helpBottomPx = 12, hideHelp = false }: ScreenTourProps) {
    const [open, setOpen] = useState(false);

    // First-time auto-offer. Completion AND skip both mark the tour seen, so it
    // never re-fires; the Help button remains for deliberate replays.
    useEffect(() => {
        if (isTourCompleted(tourId)) return;
        const t = setTimeout(() => setOpen(true), autoDelayMs);
        return () => clearTimeout(t);
    }, [tourId, autoDelayMs]);

    const close = () => {
        markTourCompleted(tourId);
        setOpen(false);
    };

    // The screen wasn't ready (no anchors visible) — close WITHOUT marking seen,
    // so the first-time offer fires again on the next visit.
    const closeUnavailable = () => setOpen(false);

    return (
        <>
            {!hideHelp && !open && (
                <button
                    onClick={() => setOpen(true)}
                    aria-label="Show interface tour for this screen"
                    title="Interface tour"
                    className="qq-tour-help qq-press"
                    style={{ bottom: helpBottomPx }}
                >
                    ?
                </button>
            )}
            {open && <UiTour steps={steps} onClose={close} onUnavailable={closeUnavailable} />}
        </>
    );
}
