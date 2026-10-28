/// <reference lib="webworker" />
import type { WorkerIn, WorkerOut } from '../types';
import {
  EVENT_NAMES,
  EVENT_OTHER_PROPS,
  EVENT_PLAYER_PROPS,
  TICK_PROP_SETS,
  assemble,
  buildFrames,
  computeKills,
  computeRange,
  computeRounds,
  computeUtils,
  makeSampleTicks,
  num,
  type Events,
} from './build';

declare const self: DedicatedWorkerGlobalScope;

/** Convert wasm-bindgen output (Maps, BigInts) into plain JS. */
function plain(v: any): any {
  if (v instanceof Map) {
    const o: Record<string, any> = {};
    v.forEach((val, k) => (o[String(k)] = plain(val)));
    return o;
  }
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'bigint') return v.toString();
  if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) {
    const o: Record<string, any> = {};
    for (const k of Object.keys(v)) o[k] = plain(v[k]);
    return o;
  }
  return v;
}

/** Accept array-of-rows or struct-of-arrays results. */
function rowsOf(v: any): any[] {
  const p = plain(v);
  if (Array.isArray(p)) return p;
  if (p && typeof p === 'object') {
    const keys = Object.keys(p);
    const len = keys.length ? (p[keys[0]]?.length ?? 0) : 0;
    const rows = new Array(len);
    for (let i = 0; i < len; i++) {
      const r: Record<string, any> = {};
      for (const k of keys) r[k] = p[k][i];
      rows[i] = r;
    }
    return rows;
  }
  return [];
}

let parserPromise: Promise<any> | null = null;
function loadParser(): Promise<any> {
  if (!parserPromise) {
    parserPromise = (async () => {
      const mod: any = await import('demoparser2');
      const api = mod.parseTicks ? mod : mod.default && mod.default.parseTicks ? mod.default : mod;
      if (typeof mod.default === 'function' && mod.parseTicks) await mod.default();
      if (typeof api.initThreadPool === 'function' && (self as any).crossOriginIsolated) {
        try {
          await api.initThreadPool(Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
        } catch {
          /* single thread is fine */
        }
      }
      if (typeof api.parseTicks !== 'function') throw new Error('Parser demoparser2 nie udostępnia parseTicks');
      return api;
    })();
  }
  return parserPromise;
}

const post = (m: WorkerOut, transfer: Transferable[] = []) => self.postMessage(m, transfer);
const progress = (stage: string, pct: number) => post({ type: 'progress', stage, pct });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function parseAllEvents(dp: any, buf: Uint8Array): Events {
  const grouped: Events = {};
  for (const n of EVENT_NAMES) grouped[n] = [];
  if (typeof dp.parseEvents === 'function') {
    for (const [pp, op] of [
      [EVENT_PLAYER_PROPS, EVENT_OTHER_PROPS],
      [[], []],
    ]) {
      try {
        const all = rowsOf(dp.parseEvents(buf, EVENT_NAMES, pp, op));
        for (const e of all) {
          const name = e.event_name ?? e.name;
          if (name && grouped[name]) grouped[name].push(e);
        }
        return grouped;
      } catch {
        /* try next */
      }
    }
  }
  EVENT_NAMES.forEach((name, i) => {
    progress(`Zdarzenia: ${name}`, 12 + Math.round((i / EVENT_NAMES.length) * 30));
    for (const [pp, op] of [
      [EVENT_PLAYER_PROPS, EVENT_OTHER_PROPS],
      [[], []],
    ]) {
      try {
        grouped[name] = rowsOf(dp.parseEvent(buf, name, pp, op));
        break;
      } catch {
        /* event may not exist in this demo */
      }
    }
  });
  return grouped;
}

function parseTicksWithFallback(dp: any, buf: Uint8Array, wanted: Int32Array): any[] {
  let last: unknown;
  for (const props of TICK_PROP_SETS) {
    try {
      return rowsOf(dp.parseTicks(buf, props, wanted));
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`Nie udało się odczytać pozycji graczy: ${errMsg(last)}`);
}

function detectFormat(buf: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 8));
  if (head.startsWith('PBDEMS2')) return 'cs2';
  if (head.startsWith('HL2DEMO')) return 'csgo';
  if (head.startsWith('BZh')) return 'bz2';
  if (head.startsWith('PK')) return 'zip';
  return 'unknown';
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  if (ev.data.type !== 'parse') return;
  try {
    progress('Wczytywanie pliku', 2);
    const buf = new Uint8Array(await ev.data.file.arrayBuffer());
    const fmt = detectFormat(buf);
    if (fmt === 'csgo') throw new Error('To demo z CS:GO. Obsługiwane są tylko dema CS2.');
    if (fmt === 'bz2') throw new Error('Plik jest spakowany (.dem.bz2). Rozpakuj go (np. 7-Zip) i wrzuć plik .dem.');
    if (fmt === 'zip') throw new Error('To archiwum ZIP. Rozpakuj je i wrzuć plik .dem.');
    if (fmt !== 'cs2') throw new Error('To nie wygląda na demo CS2 (.dem).');

    progress('Ładowanie parsera', 6);
    const dp = await loadParser();

    progress('Nagłówek', 10);
    let mapName = 'unknown';
    try {
      const h = plain(dp.parseHeader(buf));
      mapName = String(h?.map_name ?? h?.mapName ?? 'unknown');
    } catch {
      /* header optional */
    }
    mapName = mapName.split('/').pop()!.replace(/\.vpk$/i, '').toLowerCase();

    progress('Zdarzenia (rundy, bomba, zabójstwa, granaty)', 12);
    const events = parseAllEvents(dp, buf);
    const prelimRange = computeRange(events, []);
    const rounds = computeRounds(events, prelimRange.last);
    const range = computeRange(events, rounds);
    if (range.last - range.first < 64) throw new Error('Nie znaleziono rund w tym demie.');

    const lowMem = ((navigator as any).deviceMemory ?? 8) <= 4;
    const span = range.last - range.first;
    const step = span / 4 > 60000 || lowMem ? 8 : 4;
    const sampleTicks = makeSampleTicks(range.first, range.last, step);

    progress('Pozycje graczy (to trwa najdłużej)', 45);
    const rows = parseTicksWithFallback(dp, buf, sampleTicks);

    progress('Budowanie osi czasu', 88);
    const frames = buildFrames(rows, sampleTicks);
    if (!frames.ticks.length || !frames.players.length) throw new Error('Demo nie zawiera danych graczy.');
    const data = assemble(mapName, step, range, rounds, computeKills(events), computeUtils(events), frames);

    // sanity: clamp round ticks into range
    for (const r of data.rounds) r.officialEndTick = Math.min(r.officialEndTick, num(data.lastTick));

    progress('Gotowe', 100);
    post({ type: 'done', data }, [
      data.ticks.buffer,
      data.x.buffer,
      data.y.buffer,
      data.z.buffer,
      data.yaw.buffer,
      data.hp.buffer,
      data.armor.buffer,
      data.team.buffer,
      data.flags.buffer,
      data.money.buffer,
      data.weapon.buffer,
    ]);
  } catch (e) {
    post({ type: 'error', message: errMsg(e) });
  }
};
