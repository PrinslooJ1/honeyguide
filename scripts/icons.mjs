// Generates the app icons from one SVG (run once: node scripts/icons.mjs; needs sharp).
import sharp from 'sharp';
const mark = (bg, pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="${bg}"/>
<g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 64})">
<path d="M32 4 56 18v28L32 60 8 46V18z" fill="#F5A524"/>
<path d="M17 35c6-1 10-4 13-9 2 4 6 6 11 6l7-3c-2 5-6 8-11 9l-6 7-2-6c-4 0-8-1-12-4z" fill="#1C1A17"/>
<circle cx="41" cy="29" r="1.6" fill="#F5A524"/></g></svg>`;
await sharp(Buffer.from(mark('#1C1A17', 48))).resize(512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(mark('#1C1A17', 48))).resize(192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(mark('#1C1A17', 110))).resize(512).png().toFile('public/icons/maskable-512.png');
console.log('icons done');
