import { useCallback, useMemo, useRef } from 'react';
import type { Option } from '../../game/types';

interface SegmentedControlProps<T extends string> {
    options: readonly Option<T>[];
    value: T;
    onChange: (v: T) => void;
    label?: string;
    columns?: number;
}

export function SegmentedControl<T extends string>({ options, value, onChange, label, columns }: SegmentedControlProps<T>) {
    const cols = columns || options.length;
    const groupRef = useRef<HTMLDivElement>(null);
    const groupId = useMemo(
        () => `seg-${(label || 'group').replace(/\s+/g, '-').toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
        [label]
    );

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
        onChange(options[nextIdx].value);
        requestAnimationFrame(() => {
            const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
            buttons?.[nextIdx]?.focus();
        });
    }, [options, value, onChange]);

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
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onChange(option.value)}
                            role="radio"
                            aria-checked={selected}
                            tabIndex={selected ? 0 : -1}
                            className={`py-2.5 px-2 rounded border transition-all text-left min-h-[56px] ${
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
        </div>
    );
}
