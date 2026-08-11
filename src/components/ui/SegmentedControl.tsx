import { useCallback, useMemo, useRef, useState } from 'react';
import type { Option } from '../../game/types';
import { playSound } from '../../game/audio';

interface SegmentedControlProps<T extends string> {
    options: readonly Option<T>[];
    value: T;
    onChange: (v: T) => void;
    label?: string;
    columns?: number;
    helpText?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, label, columns, helpText }: SegmentedControlProps<T>) {
    const cols = columns || options.length;
    const groupRef = useRef<HTMLDivElement>(null);
    // Nonce that identifies the most recent selection so we can play a one-shot
    // press animation on just that button without disturbing the others.
    const [pressed, setPressed] = useState<{ value: T; nonce: number } | null>(null);
    const groupId = useMemo(
        () => `seg-${(label || 'group').replace(/\s+/g, '-').toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
        [label]
    );

    const select = useCallback((v: T) => {
        playSound('button');
        setPressed(prev => ({ value: v, nonce: (prev?.nonce ?? 0) + 1 }));
        onChange(v);
    }, [onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const idx = options.findIndex(o => o.value === value);
        let nextIdx = idx;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            nextIdx = (idx + 1) % options.length; e.preventDefault();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            nextIdx = (idx - 1 + options.length) % options.length; e.preventDefault();
        } else if (e.key === 'Home') {
            nextIdx = 0; e.preventDefault();
        } else if (e.key === 'End') {
            nextIdx = options.length - 1; e.preventDefault();
        } else return;
        select(options[nextIdx].value);
        requestAnimationFrame(() => {
            const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
            buttons?.[nextIdx]?.focus();
        });
    }, [options, value, select]);

    return (
        <div>
            {label && (
                <label id={`${groupId}-label`} className="text-sm text-slate-300 font-medium mb-2 block">{label}</label>
            )}
            <div
                ref={groupRef}
                role="radiogroup"
                aria-labelledby={label ? `${groupId}-label` : undefined}
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                onKeyDown={handleKeyDown}
            >
                {options.map(option => {
                    const selected = value === option.value;
                    const justPressed = pressed?.value === option.value;
                    return (
                        <button
                            // Remounting the just-pressed button replays the press-pop animation.
                            // Keyboard focus is restored by the rAF refocus in handleKeyDown.
                            key={justPressed ? `${option.value}-${pressed?.nonce}` : option.value}
                            type="button"
                            onClick={() => select(option.value)}
                            role="radio"
                            aria-checked={selected}
                            tabIndex={selected ? 0 : -1}
                            className={`qq-press py-2.5 px-2 rounded border transition-all text-left min-h-[56px] ${justPressed ? 'animate-press' : ''} ${
                                selected
                                    ? 'border-cyan-400 bg-cyan-500/20 text-white glow-cyan'
                                    : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-500 hover:bg-slate-800/70 hover:text-slate-300'
                            }`}
                        >
                            <div className={`font-bold text-sm ${selected ? 'text-cyan-300' : ''}`}>{option.label}</div>
                            <div className="text-xs opacity-70 mt-0.5">{option.shortDesc}</div>
                        </button>
                    );
                })}
            </div>
            {helpText && <p className="text-xs text-slate-500 leading-snug mt-1.5">{helpText}</p>}
        </div>
    );
}
