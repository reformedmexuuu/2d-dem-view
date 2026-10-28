import {
  Bounds,
  DemoData,
  F_ALIVE,
  F_DEFUSER,
  F_HELMET,
  KillEvent,
  PlayerMeta,
  RoundInfo,
  UtilEvent,
  UtilType,
} from '../types';

export const TICK_RATE = 64;

export const EVENT_NAMES = [
  'round_start',
  'round_freeze_end',
  'round_end',
  'round_officially_ended',
  'bomb_planted',
  'bomb_defused',
  'bomb_exploded',
  'player_death',
  'smokegrenade_detonate',
  'smokegrenade_expired',
  'inferno_startburn',
  'inferno_expire',
  'hegrenade_detonate',
  'flashbang_detonate',
];

export const EVENT_PLAYER_PROPS = ['X', 'Y', 'Z', 'team_num'];
export const EVENT_OTHER_PROPS = ['total_rounds_played', 'is_warmup_period'];

/** Full prop set, then progressively smaller fallbacks if the parser rejects a prop. */
export const TICK_PROP_SETS = [
  ['X', 'Y', 'Z', 'yaw', 'health', 'armor_value', 'is_alive', 'team_num', 'balance', 'active_weapon_name', 'has_helmet', 'has_defuser'],
  ['X', 'Y', 'Z', 'yaw', 'health', 'armor_value', 'is_alive', 'team_num', 'balance', 'active_weapon_name'],
  ['X', 'Y', 'Z', 'yaw', 'health', 'team_num'],
];

export type Events = Record<string, any[]>;

export const num = (v: unknown, d = 0): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return d;
};

export const truthy = (v: unknown): boolean => v === true || v === 1 || v === 'true' || v === '1';

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

const teamOf = (v: unknown): number => {
  if (typeof v === 'string') {
    const s = v.toUpperCase();
    if (s === 'T' || s === 'TERRORIST') return 2;
    if (s === 'CT') return 3;
  }
  const n = num(v);
  return n === 2 || n === 3 ? n : 0;
};

const notWarmup = (e: any) => !truthy(e.is_warmup_period);

const ticksOf = (list: any[] | undefined, filter: (e: any) => boolean = () => true): any[] =>
  (list ?? []).filter(filter).sort((a, b) => num(a.tick) - num(b.tick));

const firstIn = (list: any[], from: number, to: number, inclusiveFrom = true) =>
  list.find((e) => {
    const t = num(e.tick);
    return (inclusiveFrom ? t >= from : t > from) && t <= to;
  });

export function computeRounds(ev: Events, lastTick: number): RoundInfo[] {
  const starts = ticksOf(ev.round_start, notWarmup);
  const freezes = ticksOf(ev.round_freeze_end, notWarmup);
  const ends = ticksOf(ev.round_end, notWarmup);
  const offs = ticksOf(ev.round_officially_ended, notWarmup);
  const plants = ticksOf(ev.bomb_planted, notWarmup);
  const defuses = ticksOf(ev.bomb_defused, notWarmup);
  const explodes = ticksOf(ev.bomb_exploded, notWarmup);

  const startTicks: number[] = [];
  for (const s of starts) {
    const t = num(s.tick);
    if (!startTicks.length || t > startTicks[startTicks.length - 1]) startTicks.push(t);
  }
  // demo recorded mid-round: synthesize a start before the first freeze end
  if (freezes.length && (!startTicks.length || num(freezes[0].tick) < startTicks[0])) {
    startTicks.unshift(Math.max(0, num(freezes[0].tick) - 15 * TICK_RATE));
  }

  const rounds: RoundInfo[] = [];
  let scoreT = 0;
  let scoreCT = 0;
  for (let i = 0; i < startTicks.length; i++) {
    const s = startTicks[i];
    const next = i + 1 < startTicks.length ? startTicks[i + 1] : Number.POSITIVE_INFINITY;
    const fe = firstIn(freezes, s, next - 1);
    const en = firstIn(ends, s, next, false);
    if (!fe && !en) continue; // aborted / restart
    const endTick = en ? num(en.tick) : Math.min(lastTick, next - 1);
    const off = firstIn(offs, endTick, next);
    const officialEndTick = off
      ? num(off.tick)
      : Number.isFinite(next)
        ? next - 1
        : Math.min(lastTick, endTick + 7 * TICK_RATE);
    const winner = en ? teamOf(en.winner) : 0;
    const reason = en ? num(en.reason) : 0;
    const plant = firstIn(plants, s, endTick);
    const round: RoundInfo = {
      num: rounds.length + 1,
      startTick: s,
      freezeEndTick: fe ? num(fe.tick) : s,
      endTick,
      officialEndTick: Math.max(officialEndTick, endTick),
      winner,
      reason,
      scoreT,
      scoreCT,
    };
    if (plant) {
      round.plantTick = num(plant.tick);
      round.bombX = num(plant.user_X, NaN);
      round.bombY = num(plant.user_Y, NaN);
      round.bombZ = num(plant.user_Z, NaN);
      const lim = Number.isFinite(next) ? next : lastTick;
      const d = firstIn(defuses, round.plantTick, lim);
      const x = firstIn(explodes, round.plantTick, lim);
      if (d) round.defuseTick = num(d.tick);
      if (x) round.explodeTick = num(x.tick);
    }
    rounds.push(round);
    if (winner === 2) scoreT++;
    else if (winner === 3) scoreCT++;
  }
  return rounds;
}

export function computeRange(ev: Events, rounds: RoundInfo[]): { first: number; last: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const list of Object.values(ev)) {
    for (const e of list) {
      const t = num(e.tick, NaN);
      if (!Number.isFinite(t)) continue;
      if (t < min) min = t;
      if (t > max) max = t;
    }
  }
  const first = rounds.length ? rounds[0].startTick : Number.isFinite(min) ? min : 0;
  const lastRound = rounds[rounds.length - 1];
  const last = Math.max(max, lastRound ? lastRound.officialEndTick : 0);
  return { first, last: Math.max(last, first + 1) };
}

export function makeSampleTicks(first: number, last: number, step: number): Int32Array {
  const n = Math.floor((last - first) / step) + 1;
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = first + i * step;
  return out;
}

export function computeKills(ev: Events): KillEvent[] {
  return ticksOf(ev.player_death, notWarmup).map((e) => ({
    tick: num(e.tick),
    attacker: str(e.attacker_name),
    attackerTeam: teamOf(e.attacker_team_num),
    victim: str(e.user_name),
    victimTeam: teamOf(e.user_team_num),
    assister: str(e.assister_name),
    weapon: str(e.weapon),
    headshot: truthy(e.headshot),
    x: num(e.user_X, NaN),
    y: num(e.user_Y, NaN),
    z: num(e.user_Z, NaN),
  }));
}

export function computeUtils(ev: Events): UtilEvent[] {
  const out: UtilEvent[] = [];
  const add = (type: UtilType, list: any[] | undefined, expire: any[] | undefined, fallbackSec: number) => {
    const exp = ticksOf(expire);
    for (const e of ticksOf(list, notWarmup)) {
      const start = num(e.tick);
      const id = e.entityid;
      let end = start + fallbackSec * TICK_RATE;
      if (id !== undefined && exp.length) {
        const m = exp.find((x) => x.entityid === id && num(x.tick) > start);
        if (m) end = num(m.tick);
      }
      const x = num(e.x, num(e.user_X, NaN));
      const y = num(e.y, num(e.user_Y, NaN));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({ type, startTick: start, endTick: end, x, y, z: num(e.z, num(e.user_Z, 0)), team: teamOf(e.user_team_num) });
    }
  };
  add('smoke', ev.smokegrenade_detonate, ev.smokegrenade_expired, 20);
  add('molotov', ev.inferno_startburn, ev.inferno_expire, 7);
  add('he', ev.hegrenade_detonate, undefined, 0.7);
  add('flash', ev.flashbang_detonate, undefined, 0.5);
  out.sort((a, b) => a.startTick - b.startTick);
  return out;
}

/**
 * Build compact typed arrays from parseTicks rows.
 * Samples with no rows at all are dropped (tick gaps in the demo).
 */
export function buildFrames(rows: any[], sampleTicks: Int32Array) {
  const tickIndex = new Map<number, number>();
  for (let i = 0; i < sampleTicks.length; i++) tickIndex.set(sampleTicks[i], i);

  const players: PlayerMeta[] = [];
  const pIndex = new Map<string, number>();
  const keyOf = (r: any) => {
    const sid = str(r.steamid);
    return sid && sid !== '0' ? sid : `bot:${str(r.name)}`;
  };
  for (const r of rows) {
    const team = teamOf(r.team_num);
    if (team !== 2 && team !== 3) continue;
    const key = keyOf(r);
    if (!pIndex.has(key)) {
      pIndex.set(key, players.length);
      players.push({ key, steamid: str(r.steamid), name: str(r.name) || 'unknown' });
    }
  }

  const S = sampleTicks.length;
  const P = Math.max(players.length, 1);
  const N = S * P;
  const x = new Float32Array(N).fill(NaN);
  const y = new Float32Array(N).fill(NaN);
  const z = new Float32Array(N).fill(NaN);
  const yaw = new Float32Array(N);
  const hp = new Uint8Array(N);
  const armor = new Uint8Array(N);
  const team = new Uint8Array(N);
  const flags = new Uint8Array(N);
  const money = new Int32Array(N);
  const weapon = new Uint16Array(N);
  const weapons: string[] = [''];
  const wIndex = new Map<string, number>([['', 0]]);
  const hasRow = new Uint8Array(S);

  for (const r of rows) {
    const si = tickIndex.get(num(r.tick, -1));
    if (si === undefined) continue;
    const pi = pIndex.get(keyOf(r));
    if (pi === undefined) continue;
    const k = si * P + pi;
    hasRow[si] = 1;
    x[k] = num(r.X, NaN);
    y[k] = num(r.Y, NaN);
    z[k] = num(r.Z, NaN);
    yaw[k] = num(r.yaw);
    const h = Math.max(0, Math.min(255, Math.round(num(r.health))));
    hp[k] = h;
    armor[k] = Math.max(0, Math.min(255, Math.round(num(r.armor_value))));
    team[k] = teamOf(r.team_num);
    const alive = r.is_alive === undefined ? h > 0 : truthy(r.is_alive) && h > 0;
    flags[k] = (alive ? F_ALIVE : 0) | (truthy(r.has_helmet) ? F_HELMET : 0) | (truthy(r.has_defuser) ? F_DEFUSER : 0);
    money[k] = Math.round(num(r.balance));
    const w = str(r.active_weapon_name);
    let wi = wIndex.get(w);
    if (wi === undefined) {
      wi = weapons.length;
      weapons.push(w);
      wIndex.set(w, wi);
    }
    weapon[k] = wi;
  }

  // compact: drop samples without any rows
  let keep = 0;
  for (let i = 0; i < S; i++) if (hasRow[i]) keep++;
  const ticks = new Int32Array(keep);
  const take = <T extends Float32Array | Uint8Array | Int32Array | Uint16Array>(src: T, make: (n: number) => T): T => {
    const dst = make(keep * P);
    let j = 0;
    for (let i = 0; i < S; i++) {
      if (!hasRow[i]) continue;
      dst.set(src.subarray(i * P, i * P + P), j * P);
      j++;
    }
    return dst;
  };
  let j = 0;
  for (let i = 0; i < S; i++) if (hasRow[i]) ticks[j++] = sampleTicks[i];

  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let k = 0; k < N; k++) {
    if (!(flags[k] & F_ALIVE)) continue;
    const xx = x[k];
    const yy = y[k];
    if (!Number.isFinite(xx) || !Number.isFinite(yy)) continue;
    if (xx < bounds.minX) bounds.minX = xx;
    if (xx > bounds.maxX) bounds.maxX = xx;
    if (yy < bounds.minY) bounds.minY = yy;
    if (yy > bounds.maxY) bounds.maxY = yy;
  }
  if (!Number.isFinite(bounds.minX)) Object.assign(bounds, { minX: -2000, maxX: 2000, minY: -2000, maxY: 2000 });

  return {
    ticks,
    players: players.length ? players : [],
    x: take(x, (n) => new Float32Array(n)),
    y: take(y, (n) => new Float32Array(n)),
    z: take(z, (n) => new Float32Array(n)),
    yaw: take(yaw, (n) => new Float32Array(n)),
    hp: take(hp, (n) => new Uint8Array(n)),
    armor: take(armor, (n) => new Uint8Array(n)),
    team: take(team, (n) => new Uint8Array(n)),
    flags: take(flags, (n) => new Uint8Array(n)),
    money: take(money, (n) => new Int32Array(n)),
    weapon: take(weapon, (n) => new Uint16Array(n)),
    weapons,
    bounds,
  };
}

export function assemble(
  mapName: string,
  sampleStep: number,
  range: { first: number; last: number },
  rounds: RoundInfo[],
  kills: KillEvent[],
  utils: UtilEvent[],
  frames: ReturnType<typeof buildFrames>,
): DemoData {
  return {
    mapName,
    tickRate: TICK_RATE,
    sampleStep,
    firstTick: frames.ticks.length ? Math.max(range.first, frames.ticks[0]) : range.first,
    lastTick: frames.ticks.length ? Math.min(range.last, frames.ticks[frames.ticks.length - 1]) : range.last,
    rounds,
    kills,
    utils,
    ...frames,
  };
}
