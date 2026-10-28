import { DemoData, F_ALIVE, F_DEFUSER, F_HELMET, KillEvent, RoundInfo } from './types';

export const ROUND_TIME_SEC = 115;
export const BOMB_TIME_SEC = 40;

export interface SamplePos {
  i: number;
  a: number;
}

/** Index of the last sample <= tick, and interpolation factor to the next sample. */
export function sampleAt(d: DemoData, tick: number): SamplePos {
  const t = d.ticks;
  if (tick <= t[0]) return { i: 0, a: 0 };
  const n = t.length;
  if (tick >= t[n - 1]) return { i: n - 1, a: 0 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= tick) lo = mid;
    else hi = mid;
  }
  const span = t[hi] - t[lo];
  return { i: lo, a: span > 0 ? (tick - t[lo]) / span : 0 };
}

export interface PlayerState {
  idx: number;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  armor: number;
  team: number;
  alive: boolean;
  helmet: boolean;
  defuser: boolean;
  money: number;
  weapon: string;
}

const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
};

export function playerState(d: DemoData, p: number, s: SamplePos): PlayerState {
  const P = d.players.length;
  const k = s.i * P + p;
  const alive = (d.flags[k] & F_ALIVE) !== 0;
  let x = d.x[k];
  let y = d.y[k];
  let z = d.z[k];
  let yaw = d.yaw[k];
  if (s.a > 0 && s.i + 1 < d.ticks.length) {
    const k2 = k + P;
    const alive2 = (d.flags[k2] & F_ALIVE) !== 0;
    if (alive && alive2 && d.team[k] === d.team[k2]) {
      const dx = d.x[k2] - x;
      const dy = d.y[k2] - y;
      if (dx * dx + dy * dy < 400 * 400) {
        x += dx * s.a;
        y += dy * s.a;
        z += (d.z[k2] - z) * s.a;
        yaw = lerpAngle(yaw, d.yaw[k2], s.a);
      }
    }
  }
  return {
    idx: p,
    name: d.players[p].name,
    x,
    y,
    z,
    yaw,
    hp: d.hp[k],
    armor: d.armor[k],
    team: d.team[k],
    alive,
    helmet: (d.flags[k] & F_HELMET) !== 0,
    defuser: (d.flags[k] & F_DEFUSER) !== 0,
    money: d.money[k],
    weapon: d.weapons[d.weapon[k]] ?? '',
  };
}

export function roundIndexAt(d: DemoData, tick: number): number {
  let idx = -1;
  for (let i = 0; i < d.rounds.length; i++) {
    if (d.rounds[i].startTick <= tick) idx = i;
    else break;
  }
  return idx;
}

export type ClockPhase = 'warmup' | 'freeze' | 'live' | 'bomb' | 'defused' | 'exploded' | 'over';

export interface RoundClock {
  phase: ClockPhase;
  seconds: number;
  bombSeconds?: number;
}

export function roundClock(r: RoundInfo | undefined, tick: number, rate: number): RoundClock {
  if (!r) return { phase: 'warmup', seconds: 0 };
  if (tick < r.freezeEndTick) return { phase: 'freeze', seconds: (r.freezeEndTick - tick) / rate };
  if (r.plantTick !== undefined && tick >= r.plantTick) {
    const bombSeconds = Math.max(0, BOMB_TIME_SEC - (tick - r.plantTick) / rate);
    if (r.defuseTick !== undefined && tick >= r.defuseTick) return { phase: 'defused', seconds: 0, bombSeconds };
    if (r.explodeTick !== undefined && tick >= r.explodeTick) return { phase: 'exploded', seconds: 0, bombSeconds: 0 };
    return { phase: 'bomb', seconds: bombSeconds, bombSeconds };
  }
  if (tick >= r.endTick) return { phase: 'over', seconds: 0 };
  return { phase: 'live', seconds: Math.max(0, ROUND_TIME_SEC - (tick - r.freezeEndTick) / rate) };
}

export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function killsUpTo(d: DemoData, tick: number, from = 0): KillEvent[] {
  return d.kills.filter((k) => k.tick >= from && k.tick <= tick);
}

export const weaponLabel = (w: string) =>
  w
    .replace(/^weapon_/, '')
    .replace(/^item_/, '')
    .replace(/_/g, ' ')
    .toUpperCase();
