// Small, self-contained UI primitives that share basic panel/status vocabulary.
import type { ReactNode } from 'react';
import type { IconName, Warning, Rank } from '../../game/types';
import { Icon } from './Icon';

// ---------- StatusChip ----------
type ChipStatus = 'good' | 'warning' | 'danger' | 'neutral' | 'info';
export function StatusChip({ label, value, status = 'neutral', showIcon = false }: {
    label: string; value: string | number; status?: ChipStatus; showIcon?: boolean;
}) {
    const colors: Record<ChipStatus, string> = {
        good: 'text-green-400 border-green-500/40 bg-green-500/10',
        warning: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
        danger: 'text-red-400 border-red-500/40 bg-red-500/10',
        neutral: 'text-slate-400 border-slate-600 bg-slate-800/50',
        info: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
    };
    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium ${colors[status]}`}>
            {showIcon && <Icon name="Activity" className="w-3.5 h-3.5" />}
            <span className="opacity-80">{label}</span>
            <span className="font-mono font-bold tracking-wide">{value}</span>
        </div>
    );
}

// ---------- RiskMeter ----------
export function RiskMeter({
    label, value, max = 100, thresholds = { low: 30, high: 70 },
    inverted = false, hint, flashClass,
}: {
    label: string; value: number; max?: number;
    thresholds?: { low: number; high: number };
    inverted?: boolean; hint?: string | null; flashClass?: string;
}) {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    let status: 'good' | 'warning' | 'danger' = 'good';
    if (inverted) {
        if (pct >= thresholds.high) status = 'good';
        else if (pct >= thresholds.low) status = 'warning';
        else status = 'danger';
    } else {
        if (pct <= thresholds.low) status = 'good';
        else if (pct <= thresholds.high) status = 'warning';
        else status = 'danger';
    }
    const barColor = { good: 'bg-green-500', warning: 'bg-amber-500', danger: 'bg-red-500' }[status];
    const textColor = { good: 'text-green-400', warning: 'text-amber-400', danger: 'text-red-400' }[status];

    return (
        <div className={`space-y-1 rounded px-1 -mx-1 ${flashClass || ''}`}>
            <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">{label}</span>
                <span className={`font-mono font-bold text-sm ${textColor}`}>
                    {value}{typeof max === 'number' && max === 100 ? '%' : ''}
                </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                    className={`h-full ${barColor} transition-all duration-300 ease-out`}
                    style={{ width: `${pct}%` }}
                    role="progressbar"
                    aria-valuenow={value}
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-label={label}
                />
            </div>
            {hint && <p className="text-xs text-slate-500 leading-tight">{hint}</p>}
        </div>
    );
}

// ---------- ConsolePanel ----------
export function ConsolePanel({ title, icon, children, status }: {
    title: string; icon?: IconName; children: ReactNode; status?: 'good' | 'warning' | 'danger' | 'info' | 'neutral';
}) {
    const borders: Record<string, string> = {
        good: 'border-l-green-500',
        warning: 'border-l-amber-500',
        danger: 'border-l-red-500',
        info: 'border-l-cyan-500',
        neutral: 'border-l-slate-600',
    };
    return (
        <div className={`panel border-l-2 ${borders[status || 'neutral']}`}>
            <div className="panel-header flex items-center gap-2">
                {icon && <span className="text-cyan-400"><Icon name={icon} className="w-4 h-4" /></span>}
                <span className="font-semibold text-xs uppercase tracking-wide">{title}</span>
            </div>
            <div className="p-4">{children}</div>
        </div>
    );
}

// ---------- WarningPill ----------
export function WarningPill({ warning }: { warning: Warning }) {
    const colors: Record<'danger' | 'warning', string> = {
        danger: 'text-red-300 border-red-500/40 bg-red-500/10',
        warning: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    };
    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs ${colors[warning.severity]}`}>
            <Icon name="Alert" className="w-3 h-3" />
            <span>{warning.label}</span>
        </div>
    );
}

// ---------- WarningAlert (full row) ----------
export function WarningAlert({ warning }: { warning: Warning }) {
    const styles = {
        danger:  { border: 'border-red-500/40',   bg: 'bg-red-500/5',   badge: 'text-red-400 bg-red-500/15',    icon: 'text-red-400' },
        warning: { border: 'border-amber-500/40', bg: 'bg-amber-500/5', badge: 'text-amber-400 bg-amber-500/15',icon: 'text-amber-400' },
    }[warning.severity];
    return (
        <div className={`p-2 rounded border ${styles.border} ${styles.bg}`}>
            <div className="flex items-center gap-2 mb-0.5">
                <span className={`${styles.icon} shrink-0`}><Icon name="Alert" className="w-3.5 h-3.5" /></span>
                <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${styles.badge}`}>{warning.severity}</span>
                <span className="text-sm font-semibold text-white truncate">{warning.label}</span>
            </div>
            <div className="text-xs text-slate-400 pl-6 leading-tight">{warning.cause}</div>
            <div className="text-[10px] pl-6 mt-0.5 text-slate-500">
                Affects: <span className="font-mono text-slate-400">{warning.metric}</span>
            </div>
        </div>
    );
}

// ---------- MedalBadge ----------
export function MedalBadge({ rank, size = 'md' }: { rank: Rank; size?: 'sm' | 'md' | 'lg' }) {
    const sizes = {
        sm: 'w-12 h-12 text-[10px]',
        md: 'w-16 h-16 text-xs',
        lg: 'w-24 h-24 text-sm',
    };
    const colorMap: Record<string, { ring: string; bg: string; text: string; glow: string }> = {
        red:   { ring: 'border-red-500',    bg: 'bg-red-500/20',   text: 'text-red-400',   glow: '' },
        amber: { ring: 'border-amber-500',  bg: 'bg-amber-500/20', text: 'text-amber-400', glow: '' },
        green: { ring: 'border-green-500',  bg: 'bg-green-500/20', text: 'text-green-400', glow: 'glow-green' },
        cyan:  { ring: 'border-cyan-400',   bg: 'bg-cyan-500/20',  text: 'text-cyan-400',  glow: 'glow-cyan' },
        gold:  { ring: 'border-amber-300',  bg: 'bg-amber-400/20', text: 'text-amber-300', glow: 'glow-gold' },
    };
    const c = colorMap[rank.color] || colorMap.amber;
    return (
        <div className={`relative ${sizes[size]} ${c.glow} shrink-0`}>
            <div className={`absolute inset-0 rounded-full border-2 ${c.ring} ${c.bg} flex items-center justify-center`}>
                <div className={`absolute inset-1 rounded-full border ${c.ring} opacity-50`} />
                <div className={`font-bold font-mono ${c.text} text-center leading-tight px-1`}>
                    {rank.label.split(' ').map((w, i) => <div key={i}>{w}</div>)}
                </div>
            </div>
        </div>
    );
}
