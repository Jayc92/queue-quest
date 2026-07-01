import { Icon } from '../components/ui/Icon';
import { StatusChip } from '../components/ui/primitives';

export function TitleScreen({ onStart }: { onStart: () => void }) {
    return (
        <div className="min-h-screen grid-bg relative overflow-hidden">
            <div className="absolute inset-0 overflow-hidden opacity-40 pointer-events-none md:block hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-2 h-2 bg-cyan-400 rounded-sm animate-packet"
                        style={{
                            top: `${20 + i * 12}%`,
                            left: 0,
                            animationDelay: `${i * 1.3}s`,
                            animationDuration: `${5 + i}s`,
                            boxShadow: '0 0 8px rgba(34,211,238,0.8)',
                        }}
                    />
                ))}
            </div>

            <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8">
                <div className="mb-6 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-blink" />
                    <span className="text-[10px] md:text-xs font-mono uppercase tracking-widest text-cyan-400">Onsale Operations System</span>
                </div>
                <div className="text-center mb-3">
                    <h1 className="font-black tracking-tight leading-none">
                        <div className="text-5xl md:text-7xl text-white">QUEUE</div>
                        <div className="text-5xl md:text-7xl text-cyan-400 md:-mt-2">QUEST</div>
                    </h1>
                </div>
                <p className="text-slate-400 text-base md:text-lg mb-1 text-center">Design the queue.</p>
                <p className="text-slate-400 text-base md:text-lg mb-8 text-center">Survive the onsale.</p>

                <div className="w-full max-w-sm mb-8 panel p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Live Demand Pulse</span>
                        <span className="text-[10px] font-mono text-red-400 animate-blink">CRITICAL</span>
                    </div>
                    <div className="h-8 flex items-end gap-0.5">
                        {Array.from({ length: 40 }).map((_, i) => {
                            const seedHeight = 20 + Math.abs(Math.sin(i * 0.7)) * 60 + Math.abs(Math.cos(i * 1.3)) * 20;
                            const color = seedHeight > 70 ? 'bg-red-500' : seedHeight > 45 ? 'bg-amber-500' : 'bg-cyan-500';
                            return (
                                <div
                                    key={i}
                                    className={`flex-1 ${color} rounded-t animate-waveform`}
                                    style={{ height: `${seedHeight}%`, animationDelay: `${i * 0.05}s`, opacity: 0.7 }}
                                />
                            );
                        })}
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] font-mono text-slate-600">
                        <span>0:00</span>
                        <span>WAITING ROOM</span>
                        <span>+24:00</span>
                    </div>
                </div>

                <button
                    onClick={onStart}
                    className="flex items-center gap-3 px-6 md:px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-base md:text-lg rounded transition-all glow-cyan"
                    style={{ color: '#0a0e14' }}
                >
                    <Icon name="Play" className="w-5 h-5" fill="currentColor" />
                    <span>Enter Command Center</span>
                    <Icon name="ArrowRight" className="w-5 h-5" />
                </button>

                <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-md">
                    <StatusChip label="Demand" value="CRITICAL" status="danger" showIcon />
                    <StatusChip label="Inventory" value="LIMITED" status="warning" showIcon />
                    <StatusChip label="Bots" value="DETECTED" status="danger" showIcon />
                    <StatusChip label="Server" value="STANDING BY" status="info" showIcon />
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-2 border-t border-cyan-900/30 bg-terminal-bg/80 backdrop-blur">
                <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-blink" />
                    <span>SYSTEM READY</span>
                </div>
            </div>
        </div>
    );
}
