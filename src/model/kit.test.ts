// Indian kits: their strokes are written without a drum machine, read back onto the grid, and get keys.
import { describe, expect, it } from 'vitest';
import { clipCode, generate } from '../codegen/generate';
import { parseCode } from '../codegen/parse';
import { demoSong } from './demo';
import { drumClip, track } from './build';
import { kitHas, voiceSound } from './kit';
import { drumHint, drumKey } from '../app/keymap';
import { INDIAN_PRESETS } from './presets';

const strip = (x: unknown) => JSON.parse(JSON.stringify(x));

function tablaSong() {
  const s = demoSong();
  s.tracks.push(track({
    id: 'tb', name: 'Tabla', kind: 'drums', color: '#a5531c', bank: 'Tabla',
    // A kick left over from before the track switched to tabla: kept, but not played.
    slots: [drumClip('Theka', 1, [{ ...INDIAN_PRESETS.Tabla.Keherwa, bd: [0, 8] }], 'ctb'), null, null, null],
    active: [0],
  }));
  return s;
}

describe('Indian kits', () => {
  it('writes strokes without a drum machine, in pad order, leaving out the other kit', () => {
    const s = tablaSong();
    const t = s.tracks[4];
    const { code } = clipCode(t, t.slots[0]!);
    expect(code).toBe('s("~ ~ tabla_na ~ tabla_na ~ ~ tabla_na, ~ ~ ~ tabla_te ~ ~ ~ ~, tabla_dha, ~ ~ ~ tabla_dhin, ~ tabla_ge ~ ~ ~ ~ ~ ~, ~ ~ ~ ~ ~ tabla_kat ~ ~")');
  });

  it('round-trips an Indian kit clip unchanged', async () => {
    const s = tablaSong();
    const res = await parseCode(generate(s).code, s);
    expect(res.errors).toEqual([]);
    expect(res.notes).toEqual([]);
    expect(strip(res.song.tracks[4].slots[0])).toEqual(strip(s.tracks[4].slots[0]));
  });

  it('reads an edited stroke pattern back onto the grid', async () => {
    const s = tablaSong();
    const code = generate(s).code;
    const line = code.split('\n').find((l) => l.startsWith('const tabla_A'))!;
    const { song } = await parseCode(code.replace(line, 'const tabla_A = s("tabla_na*4, tabla_ge")  // Theka · 1 bar'), s);
    const c = song.tracks[4].slots[0]!;
    expect(c.kind === 'drums' && !c.code && [c.hits.tabla_na.filter(Boolean).length, c.hits.tabla_ge.filter(Boolean).length]).toEqual([4, 1]);
  });

  it('keeps a drum machine on a stroke as custom code', async () => {
    const s = tablaSong();
    const code = generate(s).code;
    const line = code.split('\n').find((l) => l.startsWith('const tabla_A'))!;
    const { song } = await parseCode(code.replace(line, 'const tabla_A = s("tabla_na*4").bank("RolandTR909")'), s);
    expect(song.tracks[4].slots[0]!.code).toBeTruthy();
  });

  it('plays pads with or without a machine', () => {
    expect(voiceSound('Tabla', 'tabla_na')).toEqual({ s: 'tabla_na' });
    expect(voiceSound('Mridangam', 'nam')).toEqual({ s: 'nam' });
    expect(voiceSound('RolandTR909', 'bd:1')).toEqual({ s: 'bd', n: 1, bank: 'RolandTR909' });
    expect(voiceSound('RolandTR909', 'cb')).toEqual({ s: 'cb', bank: 'RolandTR808' });
    expect(kitHas('Tabla', 'bd')).toBe(false);
    expect(kitHas('RolandTR909', 'tabla_na')).toBe(false);
    expect(kitHas('RolandTR909', 'perc')).toBe(true);
  });

  it('lays keys out like the pads', () => {
    // The drum kit: Space kicks, toms on F G H, small percussion on R T Y U.
    expect([' ', 'b', 'c', 's', 'd', 'm', 'l', 'f', 'g', 'h', 'p', 'q', 'r', 't', 'y', 'u'].map((k) => drumKey('RolandTR909', k)))
      .toEqual(['bd', 'bd:1', 'sd', 'sd:1', 'rim', 'hh', 'oh', 'ht', 'mt', 'lt', 'cr', 'rd', 'cp', 'cb', 'sh', 'tb']);
    expect(drumHint('RolandTR909', 'bd')).toBe('Space');
    expect(drumHint('RolandTR909', 'oh')).toBe('L');
    // Indian kits: left hand from F outwards, right hand from J, both hands in the middle.
    expect(['f', 'd', 'r', 'j', 'k', 'o', 'g', 'h'].map((k) => drumKey('Tabla', k))).toEqual(['tabla_ge', 'tabla_ghe', 'tabla_kat', 'tabla_na', 'tabla_ta', 'tabla_tak', 'tabla_dha', 'tabla_dhin']);
    expect(drumHint('Tabla', 'tabla_ge')).toBe('F');
    expect(['f', 'a', 'j', 'p', 'g', '1'].map((k) => drumKey('Mridangam', k))).toEqual(['thom', 'ki', 'nam', 'ka', 'dhum', undefined]);
  });
});
