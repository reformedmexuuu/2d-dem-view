// Downloads CS2 radar images + overview metadata into public/maps at build time.
// Source: https://github.com/MurkyYT/cs2-map-icons (auto-updated from Valve depots).
// Never fails the build: missing maps fall back to an in-app footprint view.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main';
const OUT = join(process.cwd(), 'public', 'maps');
const MAPS = [
  'de_mirage', 'de_inferno', 'de_dust2', 'de_nuke', 'de_overpass', 'de_vertigo',
  'de_ancient', 'de_anubis', 'de_train', 'de_cache', 'de_cobblestone', 'de_tuscan',
  'de_basalt', 'de_edin', 'de_jura', 'de_grail', 'de_golden', 'de_palacio',
  'de_rooftop', 'de_sanctum', 'de_whistle', 'de_dogtown', 'de_brewery', 'de_thera',
  'de_mills', 'de_assembly', 'de_memento', 'de_palais', 'de_poseidon', 'de_stronghold',
  'cs_office', 'cs_italy', 'cs_agency', 'ar_shoots', 'ar_baggage', 'ar_pool_day',
];

const num = (txt, key) => {
  const m = txt.match(new RegExp(`"${key}"\\s+"(-?[\\d.]+)"`, 'i'));
  return m ? parseFloat(m[1]) : undefined;
};

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

async function one(map) {
  const txt = await (await get(`${BASE}/data/radar_info/${map}.txt`)).text();
  const posX = num(txt, 'pos_x');
  const posY = num(txt, 'pos_y');
  const scale = num(txt, 'scale');
  if (posX === undefined || posY === undefined || !scale) throw new Error(`no overview data for ${map}`);
  const lowerBlock = txt.match(/"lower"\s*\{([^}]*)\}/i);
  const lowerAltitudeMax = lowerBlock ? num(lowerBlock[1], 'AltitudeMax') : undefined;

  const upper = Buffer.from(await (await get(`${BASE}/images/radars/${map}_radar_psd.png`)).arrayBuffer());
  await writeFile(join(OUT, `${map}.png`), upper);

  let hasLower = false;
  try {
    const lower = Buffer.from(await (await get(`${BASE}/images/radars/${map}_lower_radar_psd.png`)).arrayBuffer());
    await writeFile(join(OUT, `${map}_lower.png`), lower);
    hasLower = lowerAltitudeMax !== undefined;
  } catch {
    /* single-level map */
  }
  const meta = { name: map, posX, posY, scale, hasLower, ...(hasLower ? { lowerAltitudeMax } : {}) };
  await writeFile(join(OUT, `${map}.json`), JSON.stringify(meta));
  return meta;
}

await mkdir(OUT, { recursive: true });
const ok = [];
const queue = [...MAPS];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const map = queue.shift();
      try {
        ok.push(await one(map));
        console.log(`✓ ${map}`);
      } catch (e) {
        console.log(`– ${map}: ${e.message}`);
      }
    }
  }),
);
await writeFile(join(OUT, 'index.json'), JSON.stringify(ok.map((m) => m.name).sort()));
console.log(`Radars ready: ${ok.length}/${MAPS.length}`);
