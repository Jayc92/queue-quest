interface GameSliderProps {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    helpText?: string;
    id?: string;
}

export function GameSlider({ label, value, onChange, min, max, step = 1, unit = '', helpText, id }: GameSliderProps) {
    const pct = ((value - min) / (max - min)) * 100;
    const sliderId = id || `slider-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label htmlFor={sliderId} className="text-sm text-slate-300 font-medium">{label}</label>
                <span className="font-mono text-cyan-400 font-bold text-lg tabular-nums">{value}{unit}</span>
            </div>
            <div className="relative h-11">
                <div className="slider-track">
                    <div className="slider-fill" style={{ width: `${pct}%` }} />
                </div>
                <input
                    id={sliderId}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="slider-input"
                    aria-label={label}
                    aria-valuemin={min}
                    aria-valuemax={max}
                    aria-valuenow={value}
                />
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500">
                <span>{min}{unit}</span>
                <span>{max}{unit}</span>
            </div>
            {helpText && <p className="text-xs text-slate-500 leading-snug">{helpText}</p>}
        </div>
    );
}
