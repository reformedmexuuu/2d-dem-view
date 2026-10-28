export const TEAM_T = 2;
export const TEAM_CT = 3;

export interface PlayerMeta {
  key: string;
  steamid: string;
  name: string;
}

export interface RoundInfo {
  num: number;
  startTick: number;
  freezeEndTick: number;
  endTick: number;
  officialEndTick: number;
  /** 2 = T, 3 = CT, 0 = unknown */
  winner: number;
  reason: number;
  /** score before this round started */
  scoreT: number;
  scoreCT: number;
  plantTick?: number;
  bombX?: number;
  bombY?: number;
  bombZ?: number;
  defuseTick?: number;
  explodeTick?: number;
}

export interface KillEvent {
  tick: number;
  attacker: string;
  attackerTeam: number;
  victim: string;
  victimTeam: number;
  assister: string;
  weapon: string;
  headshot: boolean;
  x: number;
  y: number;
  z: number;
}

export type UtilType = 'smoke' | 'molotov' | 'he' | 'flash';

export interface UtilEvent {
  type: UtilType;
  startTick: number;
  endTick: number;
  x: number;
  y: number;
  z: number;
  team: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Flags bitmask stored per player per sample */
export const F_ALIVE = 1;
export const F_HELMET = 2;
export const F_DEFUSER = 4;

export interface DemoData {
  mapName: string;
  tickRate: number;
  sampleStep: number;
  firstTick: number;
  lastTick: number;
  /** sampled ticks, ascending */
  ticks: Int32Array;
  players: PlayerMeta[];
  /** row-major [sample * players.length + player] */
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  hp: Uint8Array;
  armor: Uint8Array;
  team: Uint8Array;
  flags: Uint8Array;
  money: Int32Array;
  weapon: Uint16Array;
  weapons: string[];
  rounds: RoundInfo[];
  kills: KillEvent[];
  utils: UtilEvent[];
  bounds: Bounds;
}

export interface MapMeta {
  name: string;
  posX: number;
  posY: number;
  scale: number;
  /** players with z below this value are on the lower level */
  lowerAltitudeMax?: number;
  hasLower: boolean;
}

export type WorkerIn = { type: 'parse'; file: File };

export type WorkerOut =
  | { type: 'progress'; stage: string; pct: number }
  | { type: 'done'; data: DemoData }
  | { type: 'error'; message: string };
