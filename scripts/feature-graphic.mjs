// Renders store/feature-graphic.png (1024 x 500) for the Play listing. Needs sharp.
import sharp from 'sharp';
const hex = (x, y, r, fill, op = 1) => {
  const pts = [...Array(6)].map((_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`; }).join(' ');
  return `<polygon points="${pts}" fill="${fill}" opacity="${op}"/>`;
};
let comb = '';
for (let row = 0; row < 7; row++) for (let col = 0; col < 6; col++) {
  const x = 790 + col * 52 + (row % 2) * 26, y = 20 + row * 45;
  comb += hex(x, y, 28, '#F5A524', ((row * 7 + col * 3) % 5) / 18 + 0.05);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
<rect width="1024" height="500" fill="#1C1A17"/>
${comb}
<g transform="translate(70 120) scale(3.6)">
  <path d="M32 4 56 18v28L32 60 8 46V18z" fill="#F5A524"/>
  <path d="M17 35c6-1 10-4 13-9 2 4 6 6 11 6l7-3c-2 5-6 8-11 9l-6 7-2-6c-4 0-8-1-12-4z" fill="#1C1A17"/>
  <circle cx="41" cy="29" r="1.6" fill="#F5A524"/>
</g>
<text x="330" y="225" font-family="Georgia, 'DejaVu Serif', serif" font-size="72" font-weight="700" fill="#FFF8EA">Honeyguide</text>
<text x="334" y="285" font-family="'DejaVu Sans', Arial, sans-serif" font-size="34" fill="#F5A524">Beekeeping, guided.</text>
<text x="334" y="345" font-family="'DejaVu Sans', Arial, sans-serif" font-size="24" fill="#D9CDB8">The offline hive log for South African beekeepers</text>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile('store/feature-graphic.png');
console.log('store/feature-graphic.png');
