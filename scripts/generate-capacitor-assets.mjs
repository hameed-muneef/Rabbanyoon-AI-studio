// يجهّز مصادر أيقونات وشاشة الإقلاع لتطبيق الأندرويد (Capacitor):
//   assets/logo.png   1024×1024 (مع هامش أمان)
//   assets/splash.png 2732×2732 خلفية داكنة والشعار في الوسط
// ثم تُولَّد أيقونات النظام بـ: npx @capacitor/assets generate --android
import {readFile, mkdir} from 'node:fs/promises';
import sharp from 'sharp';

const GREEN = '#173F35';
const source = await readFile('public/icons/app-icon.svg', 'utf8');
const fullBleed = source
  .replace('<rect width="512" height="512" rx="96" fill="#173F35"/>', '<rect width="512" height="512" fill="#173F35"/>')
  .replace(/(<path d="M256 150)/, '<g transform="translate(256 256) scale(0.72) translate(-256 -256)">$1')
  .replace(/(<\/svg>)/, '</g>$1');

await mkdir('assets', {recursive: true});

// الشعار: خلفية خضراء والكتاب داخل المنطقة الآمنة (حوالي 66% من الأبعاد)
const logoSvg = fullBleed.replace('scale(0.72)', 'scale(0.62)');
await sharp(Buffer.from(logoSvg), {density: 96 * 2})
  .resize(1024, 1024)
  .png()
  .toFile('assets/logo.png');
console.log('assets/logo.png (1024×1024)');

// شاشة الإقلاع: خلفية خضراء والشعار في المنتصف (الحجم الأقصى المدعوم 2732×2732)
const splashSize = 2732;
const logoPng = await sharp(Buffer.from(logoSvg), {density: 96 * 2}).resize(768, 768).png().toBuffer();
await sharp({
  create: {width: splashSize, height: splashSize, channels: 4, background: GREEN},
}).composite([{input: logoPng, gravity: 'centre'}]).png().toFile('assets/splash.png');
console.log('assets/splash.png (2732×2732)');
