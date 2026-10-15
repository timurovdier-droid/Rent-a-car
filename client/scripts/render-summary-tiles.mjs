import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../public/tiles');

function svg({ top, mid, bottom }) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="42%" y1="6%" x2="58%" y2="96%">
      <stop offset="0%" stop-color="${top}"/>
      <stop offset="40%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="${bottom}"/>
    </linearGradient>
    <linearGradient id="shine" x1="28%" y1="8%" x2="72%" y2="78%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".42"/>
      <stop offset="58%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g fill="url(#g)">
    <path d="M 236 72
      A 190 190 0 1 0 440 300
      L 328 300
      A 70 70 0 0 1 236 208
      Z"/>
    <path d="M 292 52
      A 176 176 0 0 1 460 220
      L 404 244
      A 46 46 0 0 0 354 194
      L 308 112
      A 46 46 0 0 1 292 52
      Z"/>
  </g>
  <path fill="url(#shine)" d="M 236 72
    A 190 190 0 1 0 440 300
    L 328 300
    A 70 70 0 0 1 236 208
    Z"/>
  <g fill="#fff">
    <rect x="164" y="304" width="40" height="70" rx="20"/>
    <rect x="220" y="268" width="40" height="106" rx="20"/>
    <rect x="276" y="228" width="40" height="146" rx="20"/>
  </g>
</svg>`);
}

async function render(name, colors) {
  await sharp(svg(colors), { density: 180 })
    .resize(512, 512)
    .webp({ quality: 94, alphaQuality: 100 })
    .toFile(join(dir, name));
}

await render('summary.webp', { top: '#FFF7B8', mid: '#FCE000', bottom: '#C48A00', glow: '#C48A00' });
await render('summary-dark.webp', { top: '#FFE56A', mid: '#FCE000', bottom: '#9A6E00', glow: '#FCE000' });
console.log('summary tiles rendered');
