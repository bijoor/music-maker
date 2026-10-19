// Draws the app icons (four coloured pads on a dark tile) as PNGs, plus the SVG favicon. No dependencies:
// a tiny PNG encoder using node:zlib. Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [27, 31, 28], PADS = [[232, 89, 12], [47, 158, 68], [28, 126, 214], [174, 62, 201]];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** `inset` (0–0.5) keeps the pads inside the maskable safe zone; `round` rounds the tile corners. */
function icon(size, { inset = 0.16, round = true } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const r = round ? size * 0.22 : 0;
  const inRounded = (x, y, x0, y0, x1, y1, rad) => {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad), cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  };
  const a = size * inset, b = size - a, gap = size * 0.05, mid = size / 2, pr = size * 0.06;
  const pads = [[a, a, mid - gap / 2, mid - gap / 2], [mid + gap / 2, a, b, mid - gap / 2], [a, mid + gap / 2, mid - gap / 2, b], [mid + gap / 2, mid + gap / 2, b, b]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (!inRounded(x + 0.5, y + 0.5, 0, 0, size, size, r)) continue; // transparent outside the tile
    let c = BG;
    pads.forEach((p, k) => { if (inRounded(x + 0.5, y + 0.5, p[0], p[1], p[2], p[3], pr)) c = PADS[k]; });
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icons/icon-192.png', icon(192));
writeFileSync('public/icons/icon-512.png', icon(512));
// iOS draws its own rounded corners and needs an opaque square.
writeFileSync('public/icons/apple-touch-icon.png', icon(180, { round: false, inset: 0.18 }));
// Maskable: full-bleed square, pads inside the central safe zone.
writeFileSync('public/icons/maskable-512.png', icon(512, { round: false, inset: 0.24 }));
// The native iPad wrapper (ios/): one opaque 1024 square, iOS rounds it.
writeFileSync('ios/MusicMaker/Assets.xcassets/AppIcon.appiconset/icon-1024.png', icon(1024, { round: false, inset: 0.18 }));
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="rgb(${BG})"/><rect x="11" y="11" width="19.5" height="19.5" rx="4" fill="rgb(${PADS[0]})"/><rect x="33.5" y="11" width="19.5" height="19.5" rx="4" fill="rgb(${PADS[1]})"/><rect x="11" y="33.5" width="19.5" height="19.5" rx="4" fill="rgb(${PADS[2]})"/><rect x="33.5" y="33.5" width="19.5" height="19.5" rx="4" fill="rgb(${PADS[3]})"/></svg>\n`);
console.log('icons written');
