import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock } from './clock';
import { Controls } from './components/Controls';
import { KillFeed, ScoreBar, TeamPanel, type PanelPlayer } from './components/Hud';
import { RadarCanvas } from './components/RadarCanvas';
import { loadMapAssets, type MapAssets } from './maps';
import { createParserWorker } from './parser/createWorker';
import { playerState, roundClock, roundIndexAt, sampleAt } from './timeline';
import { TEAM_CT, TEAM_T, type DemoData, type WorkerOut } from './types';

type Status =
  | { kind: 'idle' }
  | { kind: 'parsing'; stage: string; pct: number; fileName: string; started: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [data, setData] = useState<DemoData | null>(null);
  const [assets, setAssets] = useState<MapAssets>({ meta: null, upper: null, lower: null });
  const workerRef = useRef<Worker | null>(null);

  const openFile = useCallback((file: File) => {
    workerRef.current?.terminate();
    const w = createParserWorker();
    workerRef.current = w;
    setData(null);
    setStatus({ kind: 'parsing', stage: 'Start', pct: 0, fileName: file.name, started: Date.now() });
    w.onmessage = async (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'progress') {
        setStatus((s) => (s.kind === 'parsing' ? { ...s, stage: m.stage, pct: m.pct } : s));
      } else if (m.type === 'error') {
        setStatus({ kind: 'error', message: m.message });
        w.terminate();
      } else {
        const a = await loadMapAssets(m.data.mapName);
        setAssets(a);
        setData(m.data);
        setStatus({ kind: 'ready' });
        w.terminate();
        workerRef.current = null;
      }
    };
    w.onerror = (e) => setStatus({ kind: 'error', message: e.message || 'Błąd parsera' });
    w.postMessage({ type: 'parse', file });
  }, []);

  // drag & drop anywhere
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) openFile(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [openFile]);

  if (data && status.kind === 'ready') return <Viewer data={data} assets={assets} onOpen={openFile} />;
  return <Landing status={status} onOpen={openFile} />;
}

function FilePick({ onOpen, label, className }: { onOpen: (f: File) => void; label: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onOpen(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

function Landing({ status, onOpen }: { status: Status; onOpen: (f: File) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (status.kind !== 'parsing') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [status.kind]);

  return (
    <div className="landing">
      <div className="card">
        <h1>
          CS2 <span>2D</span> Demo Viewer
        </h1>
        {status.kind === 'parsing' ? (
          <div className="parsing">
            <div className="fname">{status.fileName}</div>
            <div className="bar">
              <i style={{ width: `${status.pct}%` }} />
            </div>
            <div className="pstage">
              {status.stage} · {Math.round((now - status.started) / 1000)} s
            </div>
            <p className="hint">Duże dema (300 MB+) mogą się przetwarzać nawet minutę, szczególnie na telefonie.</p>
          </div>
        ) : (
          <>
            <p className="lead">Wrzuć plik <code>.dem</code> z CS2, a zostanie przetworzony bezpośrednio w Twojej przeglądarce.</p>
            <div className="drop">
              <FilePick onOpen={onOpen} label="Wybierz plik .dem" className="primary" />
              <span className="or">lub przeciągnij go tutaj</span>
            </div>
            {status.kind === 'error' && <div className="error">{status.message}</div>}
            <ul className="features">
              <li>Radar z pozycjami i kierunkiem patrzenia graczy</li>
              <li>Czas rundy, freeze time i 40-sekundowy licznik bomby</li>
              <li>Przewijanie w przód i w tył, skok do dowolnej rundy, prędkość 0.25×–4×</li>
              <li>Granaty, zabójstwa, HP, pancerz, broń i pieniądze</li>
            </ul>
            <p className="privacy">Plik nie jest nigdzie wysyłany, całe przetwarzanie odbywa się lokalnie.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Viewer({ data, assets, onOpen }: { data: DemoData; assets: MapAssets; onOpen: (f: File) => void }) {
  const clock = useMemo(() => new Clock(data.firstTick, data.lastTick, data.tickRate), [data]);
  const [uiTick, setUiTick] = useState(clock.tick);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [level, setLevel] = useState<'upper' | 'lower'>('upper');
  const [selected, setSelected] = useState<number | null>(null);
  const [showNames, setShowNames] = useState(() => window.innerWidth >= 700);

  // start at round 1
  useEffect(() => {
    if (data.rounds.length) clock.seek(data.rounds[0].startTick);
    setUiTick(clock.tick);
  }, [clock, data]);

  // clock loop + throttled UI updates
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const wasPlaying = clock.playing;
      clock.advance(Math.min(100, now - last));
      last = now;
      if (now - lastUi > 90 || wasPlaying !== clock.playing) {
        lastUi = now;
        setUiTick(clock.tick);
        setPlaying(clock.playing);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clock]);

  const seek = useCallback(
    (t: number) => {
      clock.seek(t);
      setUiTick(clock.tick);
    },
    [clock],
  );
  const toggle = useCallback(() => {
    clock.toggle();
    setPlaying(clock.playing);
  }, [clock]);
  const skip = useCallback((sec: number) => seek(clock.tick + sec * data.tickRate), [clock, seek, data.tickRate]);
  const goRound = useCallback(
    (i: number) => {
      const r = data.rounds[Math.max(0, Math.min(data.rounds.length - 1, i))];
      if (r) seek(r.startTick);
    },
    [data, seek],
  );
  const changeSpeed = useCallback(
    (s: number) => {
      clock.speed = s;
      setSpeed(s);
    },
    [clock],
  );

  const roundIdx = roundIndexAt(data, uiTick);
  const round = roundIdx >= 0 ? data.rounds[roundIdx] : undefined;

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      const ri = roundIndexAt(data, clock.tick);
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) goRound(ri - 1);
        else skip(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) goRound(ri + 1);
        else skip(5);
      } else if (e.key === '[' || e.key === ']') {
        const SP = [0.25, 0.5, 1, 2, 4];
        const i = SP.indexOf(clock.speed) + (e.key === ']' ? 1 : -1);
        changeSpeed(SP[Math.max(0, Math.min(SP.length - 1, i))]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, clock, toggle, skip, goRound, changeSpeed]);

  // player slots: T = 1..5, CT = 6..10, fixed per round
  const slots = useMemo(() => {
    const m = new Map<number, number>();
    const at = sampleAt(data, round ? Math.max(round.freezeEndTick, round.startTick) : uiTick);
    const t: number[] = [];
    const ct: number[] = [];
    for (let i = 0; i < data.players.length; i++) {
      const st = playerState(data, i, at);
      if (st.team === TEAM_T) t.push(i);
      else if (st.team === TEAM_CT) ct.push(i);
    }
    const byName = (a: number, b: number) => data.players[a].name.localeCompare(data.players[b].name);
    t.sort(byName).forEach((p, i) => m.set(p, i + 1));
    ct.sort(byName).forEach((p, i) => m.set(p, i + 6));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, roundIdx]);

  const snapshot = useMemo(() => {
    const s = sampleAt(data, uiTick);
    const kd = new Map<string, { k: number; d: number }>();
    for (const k of data.kills) {
      if (k.tick > uiTick) break;
      if (k.attacker && k.attacker !== k.victim) {
        const a = kd.get(k.attacker) ?? { k: 0, d: 0 };
        if (k.attackerTeam !== k.victimTeam) a.k++;
        kd.set(k.attacker, a);
      }
      const v = kd.get(k.victim) ?? { k: 0, d: 0 };
      v.d++;
      kd.set(k.victim, v);
    }
    const all: PanelPlayer[] = [];
    for (let i = 0; i < data.players.length; i++) {
      const st = playerState(data, i, s);
      if (st.team !== TEAM_T && st.team !== TEAM_CT) continue;
      const stats = kd.get(st.name) ?? { k: 0, d: 0 };
      all.push({ ...st, slot: slots.get(i) ?? 99, kills: stats.k, deaths: stats.d });
    }
    all.sort((a, b) => a.slot - b.slot);
    return {
      t: all.filter((p) => p.team === TEAM_T),
      ct: all.filter((p) => p.team === TEAM_CT),
    };
  }, [data, uiTick, slots]);

  const clk = roundClock(round, uiTick, data.tickRate);
  const scoreT = round ? round.scoreT + (uiTick >= round.endTick && round.winner === TEAM_T ? 1 : 0) : 0;
  const scoreCT = round ? round.scoreCT + (uiTick >= round.endTick && round.winner === TEAM_CT ? 1 : 0) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="mapname">{data.mapName.replace(/^de_|^cs_/, '').toUpperCase()}</div>
        <ScoreBar round={round} roundCount={data.rounds.length} clock={clk} scoreT={scoreT} scoreCT={scoreCT} />
        <FilePick onOpen={onOpen} label="Nowe demo" className="ghost" />
      </header>
      <main className="stage">
        <TeamPanel team={TEAM_T} players={snapshot.t} selected={selected} onSelect={setSelected} />
        <section className="radar-wrap">
          <RadarCanvas
            data={data}
            assets={assets}
            clock={clock}
            level={level}
            slots={slots}
            selected={selected}
            showNames={showNames}
          />
          <KillFeed kills={data.kills} tick={uiTick} rate={data.tickRate} />
          {!assets.upper && <div className="no-radar">Brak obrazu radaru dla {data.mapName}, pokazuję obrys z ruchu graczy</div>}
        </section>
        <TeamPanel team={TEAM_CT} players={snapshot.ct} selected={selected} onSelect={setSelected} />
      </main>
      <Controls
        data={data}
        tick={uiTick}
        playing={playing}
        speed={speed}
        roundIdx={roundIdx}
        hasLower={!!assets.lower}
        level={level}
        showNames={showNames}
        onToggle={toggle}
        onSeek={seek}
        onSkip={skip}
        onRound={goRound}
        onSpeed={changeSpeed}
        onLevel={() => setLevel((l) => (l === 'upper' ? 'lower' : 'upper'))}
        onNames={() => setShowNames((v) => !v)}
      />
    </div>
  );
}
