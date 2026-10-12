// Builds the sample maps for instruments beyond Strudel's defaults (run when sources change):
//   node scripts/make-sample-maps.mjs
// - public/samples/tonejs.json: tonejs-instruments (samples CC-BY 3.0), recorded note by note
// - public/samples/tabla.json:  TidalCycles Dirt-Samples tabla strokes, grouped by bol
// Files are served from jsDelivr's GitHub mirror (fast, cacheable by the installed app).
import { writeFileSync, mkdirSync } from 'node:fs';

const list = async (repo, path) => {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`);
  if (!res.ok) throw new Error(`${repo}/${path}: ${res.status}`);
  return (await res.json()).map((x) => x.name);
};

// tonejs-instruments folder → sound name used in code (piano is skipped: Strudel already has one).
const TONEJS = {
  harmonium: 'harmonium', 'guitar-acoustic': 'acoustic_guitar', 'guitar-nylon': 'nylon_guitar', 'guitar-electric': 'electric_guitar',
  harp: 'concert_harp', violin: 'violin', cello: 'cello', contrabass: 'double_bass', 'bass-electric': 'electric_bass',
  flute: 'flute', clarinet: 'clarinet', saxophone: 'saxophone', trumpet: 'trumpet', trombone: 'trombone',
  'french-horn': 'french_horn', tuba: 'tuba', bassoon: 'bassoon', organ: 'church_organ', xylophone: 'xylophone_tj',
};

const tonejs = { _base: 'https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master/samples/' };
for (const [folder, name] of Object.entries(TONEJS)) {
  const files = (await list('nbrosowsky/tonejs-instruments', `samples/${folder}`)).filter((f) => f.endsWith('.mp3'));
  // Files are named by note (A2.mp3, Cs3.mp3); Strudel picks the nearest and re-pitches it.
  tonejs[name] = Object.fromEntries(files.map((f) => [f.replace('.mp3', ''), `${folder}/${f}`]));
}

// Tabla strokes from Dirt-Samples, grouped under bol names (the recordings are labelled by sound, not bol).
const TABLA_GROUPS = {
  tabla_ge: /bass_flick/, tabla_ghe: /bass_lick/, tabla_ke: /dead_hit/, tabla_ta: /d_sharp_hit/,
  tabla_tin: /hi_flick/, tabla_na: /hi_hit\d/, tabla_tun: /lower\d_hit/,
};
const files = await list('tidalcycles/Dirt-Samples', 'tabla');
const tabla = { _base: 'https://cdn.jsdelivr.net/gh/tidalcycles/Dirt-Samples@master/tabla/' };
for (const [name, re] of Object.entries(TABLA_GROUPS)) tabla[name] = files.filter((f) => re.test(f)).sort();

mkdirSync('public/samples', { recursive: true });
writeFileSync('public/samples/tonejs.json', JSON.stringify(tonejs, null, 1) + '\n');
writeFileSync('public/samples/tabla.json', JSON.stringify(tabla, null, 1) + '\n');
console.log('tonejs:', Object.keys(tonejs).length - 1, 'instruments; tabla:', Object.entries(tabla).filter(([k]) => k !== '_base').map(([k, v]) => `${k}×${v.length}`).join(' '));
