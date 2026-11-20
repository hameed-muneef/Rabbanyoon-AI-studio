// يولّد public/books/manifest.json بعدد صفحات كل PDF في public/books،
// ويقارن النتيجة بالقيم المعروفة terminًا يظل الرجل محدثًا عند تبديل أي ملف.
// التشغيل: npm run manifest
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const booksDir=join(dirname(fileURLToPath(import.meta.url)),'..','public','books');
const pdfFiles=readdirSync(booksDir).filter(f=>f.toLowerCase().endsWith('.pdf'));
const temporaryPdfs=pdfFiles.filter(f=>/-(smaller|compressed|optimized)\.pdf$/i.test(f));
if(temporaryPdfs.length){
  throw new Error(`انقل نسخ PDF التجريبية خارج public/books قبل البناء: ${temporaryPdfs.join(', ')}`);
}

// القيم المعروفة من ملفات المنهج (للتحقق من صحة العدّ)
const EXPECTED={
  'general-islam.pdf':192,
  'journey-of-life.pdf':154,
  'wa-ma-qadaru-allah.pdf':351,
  'husn-al-zann-billah.pdf':202,
  'wa-ma-baddalu-tabdila.pdf':180,
  'ma-azamaka.pdf':192,
  'law-kana-baynana.pdf':206,
  'qawaid-al-suluk.pdf':308,
};

function countPages(buffer){
  const latin=buffer.toString('latin1');
  // ١) عدّ كائنات الصفحات غير المضغوطة
  const pageObjects=(latin.match(/\/Type\s*\/Page(?![a-zA-Z])/g)??[]).length;
  if(pageObjects>0)return pageObjects;
  // ٢) اعتماد أكبر /Count (شجرة الصفحات الجذرية) في الملفات المشفرة بالكائنات
  let best=0;
  for(const match of latin.matchAll(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/g)){
    best=Math.max(best,Number(match[1]));
  }
  return best;
}

const manifest={};
for(const file of pdfFiles){
  const counted=countPages(readFileSync(join(booksDir,file)));
  manifest[file]=counted>0?counted:EXPECTED[file]??0;
  const expected=EXPECTED[file];
  const status=file in EXPECTED&&expected!==manifest[file]?`⚠ المتوقع ${expected}`:'✓';
  console.log(`${status} ${file}: ${manifest[file]} صفحة`);
}

writeFileSync(join(booksDir,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');
console.log('تم توليد public/books/manifest.json');
