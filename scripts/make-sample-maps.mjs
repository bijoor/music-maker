// Builds the sample maps for instruments beyond Strudel's defaults (run when sources change):
//   node scripts/make-sample-maps.mjs
// - public/samples/tonejs.json: tonejs-instruments (samples CC-BY 3.0), recorded note by note
// - public/samples/tabla.json:  tabla strokes from Freesound, saved in public/samples/tabla/
// Files are served from jsDelivr's GitHub mirror (fast, cacheable by the installed app).
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
  // Only files named by a plain note (A2.mp3, Cs3.mp3): a few folders also hold extra takes such as "F2 v2.mp3".
  const files = (await list('nbrosowsky/tonejs-instruments', `samples/${folder}`)).filter((f) => /^[A-G]s?\d\.mp3$/.test(f));
  // Files are named by note (A2.mp3, Cs3.mp3); Strudel picks the nearest and re-pitches it.
  tonejs[name] = Object.fromEntries(files.map((f) => [f.replace('.mp3', ''), `${folder}/${f}`]));
}

// Tabla: strokes chosen by ear from three Freesound packs (see README "Sounds and credits"), saved into the app
// so they do not depend on Freesound. Files are Freesound's 128 kbps previews; names are the bols the player uses.
//   A: "tabla bols" by mmiron, CC0 · B: "Tabla Strokes" by ajaysm, CC BY 4.0 · C: "Tabla" by msarkar, Sampling Plus 1.0
const TABLA = {
  // right hand (dayan)
  tabla_na: ['C', 56148], tabla_ta: ['C', 56150], tabla_tin: ['C', 56152], tabla_tun: ['C', 56153],
  tabla_te: ['C', 56151], tabla_te2: ['A', 130415], tabla_tak: ['A', 130427],
  // both hands
  tabla_dha: ['C', 56144], tabla_dhin: ['C', 56145],
  // left hand (bayan)
  tabla_ge: ['A', 130406], tabla_ghe: ['A', 130405], tabla_gha: ['A', 130409], tabla_ke: ['B', 171906], tabla_kat: ['B', 171901],
};
const FREESOUND_USER = { A: 1565498, B: 2385996, C: 693224 };
mkdirSync('public/samples/tabla', { recursive: true });
// _base points at the live site so older installed versions of the app (which read it) find the files; the app
// itself passes its own base, so this also works locally.
const tabla = { _base: 'https://bijoor.github.io/music-maker/samples/' };
for (const [name, [set, id]] of Object.entries(TABLA)) {
  const res = await fetch(`https://cdn.freesound.org/previews/${Math.floor(id / 1000)}/${id}_${FREESOUND_USER[set]}-hq.mp3`);
  if (!res.ok) throw new Error(`freesound ${id}: ${res.status}`);
  // Kept as WAV: an MP3 starts with ~25 ms of encoder silence that Safari plays, so strokes would sound late.
  const mp3 = `public/samples/tabla/${name.slice(6)}.mp3`;
  writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-c:a', 'pcm_s16le', mp3.replace(/\.mp3$/, '.wav')]);
  unlinkSync(mp3);
  tabla[name] = [`tabla/${name.slice(6)}.wav`];
}

mkdirSync('public/samples', { recursive: true });
writeFileSync('public/samples/tonejs.json', JSON.stringify(tonejs, null, 1) + '\n');
writeFileSync('public/samples/tabla.json', JSON.stringify(tabla, null, 1) + '\n');
console.log('tonejs:', Object.keys(tonejs).length - 1, 'instruments; tabla:', Object.keys(tabla).join(' '));
