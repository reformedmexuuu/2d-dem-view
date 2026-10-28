import { RADAR_SIZE, type Projection } from '../maps';
import { playerState, sampleAt } from '../timeline';
import { DemoData, F_ALIVE, RoundInfo, TEAM_CT, TEAM_T } from '../types';

export const TEAM_COLOR: Record<number, string> = { [TEAM_T]: '#f0b429', [TEAM_CT]: '#4da3ff' };

export interface View {
  s: number;
  ox: number;
  oy: number;
}

export interface SceneParams {
  data: DemoData;
  proj: Projection;
  tick: number;
  view: View;
  width: number;
  height: number;
  dpr: number;
  image: CanvasImageSource | null;
  level: 'upper' | 'lower';
  lowerAltitudeMax?: number;
  round?: RoundInfo;
  slots: Map<number, number>;
  selected: number | null;
  showNames: boolean;
}

/** Faint footprint of everywhere players walked; used when no radar image is available. */
export function buildSilhouette(data: DemoData, proj: Projection): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = RADAR_SIZE;
  c.height = RADAR_SIZE;
  const g = c.getContext('2d')!;
  g.fillStyle = '#141a23';
  g.fillRect(0, 0, RADAR_SIZE, RADAR_SIZE);
  g.fillStyle = 'rgba(140,160,190,0.09)';
  const P = data.players.length;
  const stride = Math.max(1, Math.floor(data.ticks.length / 6000));
  for (let i = 0; i < data.ticks.length; i += stride) {
    for (let p = 0; p < P; p++) {
      const k = i * P + p;
      if (!(data.flags[k] & F_ALIVE)) continue;
      const [rx, ry] = proj.toRadar(data.x[k], data.y[k]);
      g.fillRect(rx - 4, ry - 4, 8, 8);
    }
  }
  return c;
}

const onOtherLevel = (z: number, level: 'upper' | 'lower', lowerMax?: number) => {
  if (lowerMax === undefined || !Number.isFinite(z)) return false;
  const isLower = z < lowerMax;
  return level === 'upper' ? isLower : !isLower;
};

export function drawScene(ctx: CanvasRenderingContext2D, p: SceneParams) {
  const { data, proj, tick, view, width, height, dpr } = p;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.s, view.s);
  if (p.image) ctx.drawImage(p.image, 0, 0, RADAR_SIZE, RADAR_SIZE);

  const px = 1 / view.s; // one screen px in radar units
  const base = Math.max(5.5, Math.min(width, height) / 70);
  const R = base * px; // player radius in radar units
  const upp = proj.unitsPerPx;
  const rate = data.tickRate;

  // utility
  for (const u of data.utils) {
    if (u.startTick > tick) break;
    if (u.endTick < tick) continue;
    const [rx, ry] = proj.toRadar(u.x, u.y);
    const age = (tick - u.startTick) / rate;
    const left = (u.endTick - tick) / rate;
    ctx.globalAlpha = onOtherLevel(u.z, p.level, p.lowerAltitudeMax) ? 0.35 : 1;
    if (u.type === 'smoke') {
      const r = (144 / upp) * Math.min(1, age / 0.6 + 0.2);
      ctx.fillStyle = `rgba(190,196,206,${Math.min(0.7, left * 0.4)})`;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = TEAM_COLOR[u.team] ?? '#ccc';
      ctx.stroke();
    } else if (u.type === 'molotov') {
      const r = 120 / upp;
      ctx.fillStyle = 'rgba(255,96,32,0.45)';
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = 'rgba(255,170,60,0.9)';
      ctx.stroke();
    } else {
      const t = Math.min(1, age / ((u.endTick - u.startTick) / rate || 0.5));
      const r = ((u.type === 'he' ? 300 : 200) / upp) * (0.3 + 0.7 * t);
      ctx.strokeStyle = u.type === 'he' ? `rgba(255,80,60,${1 - t})` : `rgba(255,255,255,${1 - t})`;
      ctx.lineWidth = 3 * px;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // bomb
  const r = p.round;
  if (r && r.plantTick !== undefined && tick >= r.plantTick && tick <= r.officialEndTick && Number.isFinite(r.bombX!)) {
    const [bx, by] = proj.toRadar(r.bombX!, r.bombY!);
    const defused = r.defuseTick !== undefined && tick >= r.defuseTick;
    const exploded = r.explodeTick !== undefined && tick >= r.explodeTick;
    if (exploded) {
      ctx.fillStyle = 'rgba(255,60,30,0.35)';
      ctx.beginPath();
      ctx.arc(bx, by, 500 / upp, 0, Math.PI * 2);
      ctx.fill();
    }
    const blink = defused || exploded ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(((tick - r.plantTick) / rate) * Math.PI));
    ctx.globalAlpha = blink;
    ctx.fillStyle = defused ? '#4da3ff' : '#ff3b30';
    ctx.beginPath();
    ctx.arc(bx, by, R * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${base * 0.8 * px}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C4', bx, by);
  }

  // deaths this round
  if (r) {
    ctx.lineWidth = 2.2 * px;
    for (const k of data.kills) {
      if (k.tick < r.startTick) continue;
      if (k.tick > tick) break;
      if (!Number.isFinite(k.x)) continue;
      const [kx, ky] = proj.toRadar(k.x, k.y);
      const d = R * 0.6;
      ctx.globalAlpha = onOtherLevel(k.z, p.level, p.lowerAltitudeMax) ? 0.3 : 0.85;
      ctx.strokeStyle = TEAM_COLOR[k.victimTeam] ?? '#bbb';
      ctx.beginPath();
      ctx.moveTo(kx - d, ky - d);
      ctx.lineTo(kx + d, ky + d);
      ctx.moveTo(kx + d, ky - d);
      ctx.lineTo(kx - d, ky + d);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // players
  const s = sampleAt(data, tick);
  const order: number[] = [];
  for (let i = 0; i < data.players.length; i++) order.push(i);
  if (p.selected !== null) order.push(order.splice(p.selected, 1)[0]); // selected on top
  for (const i of order) {
    const st = playerState(data, i, s);
    if (!st.alive || (st.team !== TEAM_T && st.team !== TEAM_CT)) continue;
    if (!Number.isFinite(st.x)) continue;
    const [rx, ry] = proj.toRadar(st.x, st.y);
    const color = TEAM_COLOR[st.team];
    ctx.globalAlpha = onOtherLevel(st.z, p.level, p.lowerAltitudeMax) ? 0.35 : 1;

    // view cone
    const ang = (-st.yaw * Math.PI) / 180;
    const len = R * 3.6;
    const half = (28 * Math.PI) / 180;
    const grad = ctx.createRadialGradient(rx, ry, R * 0.5, rx, ry, len);
    grad.addColorStop(0, color + 'aa');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.arc(rx, ry, len, ang - half, ang + half);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(rx, ry, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = (p.selected === i ? 2.5 : 1.2) * px;
    ctx.strokeStyle = p.selected === i ? '#ffffff' : 'rgba(0,0,0,0.75)';
    ctx.stroke();

    // hp ring
    if (st.hp < 100) {
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = st.hp > 30 ? '#ffffff' : '#ff4d4d';
      ctx.beginPath();
      ctx.arc(rx, ry, R + 2.2 * px, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * st.hp) / 100);
      ctx.stroke();
    }

    // slot number
    const slot = p.slots.get(i);
    if (slot !== undefined) {
      ctx.fillStyle = '#0b0e13';
      ctx.font = `800 ${R * 1.15}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(slot), rx, ry + R * 0.05);
    }

    if (p.showNames) {
      ctx.font = `600 ${11 * px}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const label = st.name.length > 14 ? st.name.slice(0, 13) + '…' : st.name;
      ctx.strokeText(label, rx, ry - R - 3 * px);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, rx, ry - R - 3 * px);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
