// يولّد أيقونات PNG للتطبيق من icons/app-icon.svg
// المخرجات في public/icons/ — تُلتزم في المستودع وتُعاد فقط عند تعديل الشعار:
//   npm run icons:generate
// - icon-192/512.png: الغرض "any" (بزوايا دائرية كما في الشعار)
// - maskable-192/512.png: غرض "maskable" — خلفية ممتدة بالكامل والكتاب داخل المنطقة الآمنة 80%
// - apple-touch-icon.png: 180×180 بخلفية ممتدة (iOS يقرّب الزوايا بنفسه ويقبل PNG فقط)
import {readFile, writeFile} from 'node:fs/promises';
import sharp from 'sharp';

const ICONS_DIR = 'public/icons';
const source = await readFile(`${ICONS_DIR}/app-icon.svg`, 'utf8');

// نسخة بخلفية ممتدة بلا زوايا دائرية + الكتاب مصغّرًا داخل المنطقة الآمنة
const fullBleed = source
  .replace('<rect width="512" height="512" rx="96" fill="#173F35"/>', '<rect width="512" height="512" fill="#173F35"/>')
  .replace(/(<path d="M256 150)/, '<g transform="translate(256 256) scale(0.72) translate(-256 -256)">$1')
  .replace(/(<\/svg>)/, '</g>$1');

async function render(svg, size, out) {
  await sharp(Buffer.from(svg), {density: 96 * (size / 512)})
    .resize(size, size)
    .png()
    .toFile(`${ICONS_DIR}/${out}`);
  console.log(`generated ${out} (${size}×${size})`);
}

await render(source, 192, 'icon-192.png');
await render(source, 512, 'icon-512.png');
await render(fullBleed, 192, 'maskable-192.png');
await render(fullBleed, 512, 'maskable-512.png');
await render(fullBleed, 180, 'apple-touch-icon.png');
