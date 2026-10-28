// End-to-end check: real parser (no-modules wasm) + the app's own processing code on a real demo.
import fs from 'node:fs';
import vm from 'node:vm';
const [, , pkgDir, demoPath, buildMjs] = process.argv;
const B = await import(buildMjs);
const logs = [];
const ctx = { console: { log() {}, warn() {}, error: (...a) => logs.push(a.join(' ')) }, TextEncoder, TextDecoder, WebAssembly, URL, crypto: globalThis.crypto, performance: globalThis.performance, location: { href: 'file:///x.js' } };
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(pkgDir + '/demoparser2.js', 'utf8') + '\n;globalThis.wb = wasm_bindgen;', ctx);
const wb = ctx.wb;
wb.initSync(new WebAssembly.Module(fs.readFileSync(pkgDir + '/demoparser2_bg.wasm')));
wb.setPanicHook?.();
const buf = new Uint8Array(fs.readFileSync(demoPath));
const plain = (v) => (v && v.constructor && v.constructor.name === 'Map') ? Object.fromEntries([...v].map(([k, x]) => [k, plain(x)])) : Array.isArray(v) ? v.map(plain) : typeof v === 'bigint' ? v.toString() : v;
try {
  const events = {};
  for (const n of B.EVENT_NAMES) events[n] = [];
  for (const e of plain(wb.parseEvents(buf, B.EVENT_NAMES, B.EVENT_PLAYER_PROPS, B.EVENT_OTHER_PROPS))) events[e.event_name]?.push(e);
  const pre = B.computeRange(events, []);
  const rounds = B.computeRounds(events, pre.last);
  const range = B.computeRange(events, rounds);
  const ticks = B.makeSampleTicks(range.first, range.last, 4);
  const rows = plain(wb.parseTicks(buf, B.TICK_PROP_SETS[0], ticks));
  const frames = B.buildFrames(rows, ticks);
  const data = B.assemble('x', 4, range, rounds, B.computeKills(events), B.computeUtils(events), frames);
  const summary = {
    rounds: rounds.length,
    firstRounds: rounds.slice(0, 3).map((r) => ({ n: r.num, start: r.startTick, fe: r.freezeEndTick, end: r.endTick, w: r.winner, plant: r.plantTick ?? null })),
    lastScore: rounds.length ? [rounds.at(-1).scoreT, rounds.at(-1).scoreCT, rounds.at(-1).winner] : null,
    players: data.players.map((p) => p.name),
    samples: data.ticks.length,
    kills: data.kills.length,
    utils: data.utils.length,
    range,
  };
  console.log(JSON.stringify(summary));
  if (!rounds.length || data.players.length < 2 || !data.ticks.length) { console.error('PIPELINE CHECK FAILED'); process.exit(1); }
} catch (e) {
  console.error('PIPELINE ERROR', e?.message, logs.join(' / '));
  process.exit(1);
}
