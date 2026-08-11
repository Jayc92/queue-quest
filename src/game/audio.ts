// Queue Quest — audio hook interface.
//
// No real audio files are shipped. This module defines the set of gameplay
// sound events and a no-op dispatcher so UI code can call `playSound('launch')`
// today, and a real audio backend can be registered later via `setAudioSink`
// without touching any call sites.

export type SoundEvent =
    | 'queue_open'
    | 'warning'
    | 'launch'
    | 'pass'
    | 'fail'
    | 'strong_clear'
    | 'mastered'
    | 'button'
    | 'slider'
    | 'decision'          // a live operational decision slides in
    | 'decision_correct'  // player took the correct call
    | 'decision_wrong';   // player took the suboptimal call

export type AudioSink = (event: SoundEvent) => void;

// Default sink is a no-op. Kept module-private and swappable.
let sink: AudioSink = () => {};

// Register a real audio backend later (e.g. a WebAudio player). Optional.
export function setAudioSink(next: AudioSink): void {
    sink = next;
}

// Fire a gameplay sound event. Safe to call anywhere; never throws.
export function playSound(event: SoundEvent): void {
    try {
        sink(event);
    } catch {
        // An audio backend must never break gameplay.
    }
}

// The full catalogue of events, exported for tooling/tests/future UI.
export const SOUND_EVENTS: readonly SoundEvent[] = [
    'queue_open', 'warning', 'launch', 'pass', 'fail', 'strong_clear', 'mastered', 'button', 'slider',
    'decision', 'decision_correct', 'decision_wrong',
];
