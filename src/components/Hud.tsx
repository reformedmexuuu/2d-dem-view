import { TEAM_COLOR } from '../render/draw';
import { fmtClock, weaponLabel, type PlayerState, type RoundClock } from '../timeline';
import { TEAM_CT, TEAM_T, type KillEvent, type RoundInfo } from '../types';

export function ScoreBar({
  round,
  roundCount,
  clock,
  scoreT,
  scoreCT,
}: {
  round?: RoundInfo;
  roundCount: number;
  clock: RoundClock;
  scoreT: number;
  scoreCT: number;
}) {
  const label: Record<string, string> = {
    warmup: 'ROZGRZEWKA',
    freeze: 'FREEZE TIME',
    live: '',
    bomb: 'BOMBA',
    defused: 'ROZBROJONA',
    exploded: 'WYBUCH',
    over: 'KONIEC RUNDY',
  };
  const isBomb = clock.phase === 'bomb';
  return (
    <div className="scorebar">
      <div className="score t" style={{ color: TEAM_COLOR[TEAM_T] }}>
        <span className="side">{round?.nameT || 'T'}</span>
        <b>{scoreT}</b>
      </div>
      <div className={`clock ${isBomb ? 'bomb' : ''} ${clock.phase}`}>
        <div className="clock-time">
          {clock.phase === 'warmup' || clock.phase === 'over' || clock.phase === 'defused' || clock.phase === 'exploded'
            ? '—'
            : fmtClock(clock.seconds)}
        </div>
        <div className="clock-sub">
          {round ? `Runda ${round.num}/${roundCount}` : ''}
          {label[clock.phase] ? ` · ${label[clock.phase]}` : ''}
        </div>
        {isBomb && clock.bombSeconds !== undefined && (
          <div className="bomb-bar">
            <i style={{ width: `${(clock.bombSeconds / 40) * 100}%` }} />
          </div>
        )}
      </div>
      <div className="score ct" style={{ color: TEAM_COLOR[TEAM_CT] }}>
        <b>{scoreCT}</b>
        <span className="side">{round?.nameCT || 'CT'}</span>
      </div>
    </div>
  );
}

export interface PanelPlayer extends PlayerState {
  slot: number;
  kills: number;
  deaths: number;
}

export function TeamPanel({
  team,
  players,
  selected,
  onSelect,
}: {
  team: number;
  players: PanelPlayer[];
  selected: number | null;
  onSelect: (idx: number | null) => void;
}) {
  const color = TEAM_COLOR[team];
  const alive = players.filter((p) => p.alive).length;
  return (
    <aside className={`panel ${team === TEAM_T ? 't' : 'ct'}`} style={{ ['--team' as string]: color }}>
      <div className="panel-head">
        <span>{team === TEAM_T ? 'Terroryści' : 'Antyterroryści'}</span>
        <span className="alive">{alive} żywych</span>
      </div>
      {players.map((p) => (
        <button
          key={p.idx}
          className={`prow ${p.alive ? '' : 'dead'} ${selected === p.idx ? 'sel' : ''}`}
          onClick={() => onSelect(selected === p.idx ? null : p.idx)}
        >
          <span className="slot">{p.slot % 10}</span>
          <span className="pname">{p.name}</span>
          <span className="money">${p.money}</span>
          <span className="hpbar">
            <i style={{ width: `${p.alive ? p.hp : 0}%` }} />
          </span>
          <span className="hp">{p.alive ? p.hp : '✖'}</span>
          <span className="pinfo">
            {p.alive && p.armor > 0 && <span title="Kamizelka">{p.helmet ? '⛑' : '🛡'}</span>}
            {p.alive && p.defuser && <span title="Zestaw do rozbrajania">✂</span>}
            <span className="weapon">{p.alive ? weaponLabel(p.weapon) : ''}</span>
          </span>
          <span className="kd" title="Zabójstwa / śmierci">
            {p.kills}/{p.deaths}
          </span>
        </button>
      ))}
    </aside>
  );
}

export function KillFeed({ kills, tick, rate }: { kills: KillEvent[]; tick: number; rate: number }) {
  const recent = kills.filter((k) => k.tick <= tick && tick - k.tick < 6 * rate).slice(-5);
  if (!recent.length) return null;
  return (
    <div className="killfeed">
      {recent.map((k, i) => (
        <div className="kf" key={`${k.tick}-${i}`}>
          {k.attacker && <span style={{ color: TEAM_COLOR[k.attackerTeam] }}>{k.attacker}</span>}
          <span className="kf-w">
            {weaponLabel(k.weapon)}
            {k.headshot ? ' ◎' : ''}
          </span>
          <span style={{ color: TEAM_COLOR[k.victimTeam] }}>{k.victim}</span>
        </div>
      ))}
    </div>
  );
}
