import { useEffect, useRef } from 'react';
import { SPEEDS } from '../clock';
import { TEAM_COLOR } from '../render/draw';
import type { DemoData } from '../types';

interface Props {
  data: DemoData;
  tick: number;
  playing: boolean;
  speed: number;
  roundIdx: number;
  hasLower: boolean;
  level: 'upper' | 'lower';
  showNames: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onSkip: (sec: number) => void;
  onRound: (idx: number) => void;
  onSpeed: (s: number) => void;
  onLevel: () => void;
  onNames: () => void;
}

const fmtElapsed = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export function Controls(p: Props) {
  const { data, tick } = p;
  const span = Math.max(1, data.lastTick - data.firstTick);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('.chip.cur');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [p.roundIdx]);

  const nextSpeed = () => {
    const i = SPEEDS.indexOf(p.speed);
    p.onSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  return (
    <footer className="controls">
      <div className="scrub">
        <div className="marks" aria-hidden>
          {data.rounds.map((r) => (
            <i
              key={r.num}
              style={{
                left: `${((r.startTick - data.firstTick) / span) * 100}%`,
                background: TEAM_COLOR[r.winner] ?? '#556',
              }}
            />
          ))}
        </div>
        <input
          type="range"
          min={data.firstTick}
          max={data.lastTick}
          step={1}
          value={Math.round(tick)}
          onChange={(e) => p.onSeek(Number(e.target.value))}
          aria-label="Oś czasu"
        />
      </div>
      <div className="buttons">
        <button onClick={() => p.onRound(p.roundIdx - 1)} disabled={p.roundIdx <= 0} title="Poprzednia runda (Shift+←)">
          ⏮
        </button>
        <button onClick={() => p.onSkip(-5)} title="−5 s (←)">
          ↺5
        </button>
        <button className="play" onClick={p.onToggle} title="Odtwórz / pauza (spacja)">
          {p.playing ? '❚❚' : '▶'}
        </button>
        <button onClick={() => p.onSkip(5)} title="+5 s (→)">
          5↻
        </button>
        <button
          onClick={() => p.onRound(p.roundIdx + 1)}
          disabled={p.roundIdx >= data.rounds.length - 1}
          title="Następna runda (Shift+→)"
        >
          ⏭
        </button>
        <button className="speed" onClick={nextSpeed} title="Prędkość ([ i ])">
          {p.speed}×
        </button>
        {p.hasLower && (
          <button onClick={p.onLevel} title="Poziom mapy">
            {p.level === 'upper' ? 'Góra' : 'Dół'}
          </button>
        )}
        <button className={p.showNames ? 'on' : ''} onClick={p.onNames} title="Nicki na mapie">
          Aa
        </button>
        <span className="elapsed">{fmtElapsed((tick - data.firstTick) / data.tickRate)}</span>
      </div>
      <div className="rounds" ref={stripRef}>
        {data.rounds.map((r, i) => (
          <button
            key={r.num}
            className={`chip ${i === p.roundIdx ? 'cur' : ''}`}
            style={{ borderColor: TEAM_COLOR[r.winner] ?? '#445' }}
            onClick={() => p.onRound(i)}
          >
            {r.num}
          </button>
        ))}
      </div>
    </footer>
  );
}
