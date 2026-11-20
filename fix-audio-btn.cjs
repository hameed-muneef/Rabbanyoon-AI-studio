const fs = require('fs');
const p = 'src/views/quran/QuranReader.tsx';
const s = fs.readFileSync(p, 'utf8');
const old = '                <button className="icon-btn" aria-label={bookmarked ? \'إزالة العلامة\' : \'حفظ علامة\'} onClick={() => toggleBookmark(verse.a)}>{bookmarked ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>}</button>';
const nw = '                <button className={`icon-btn ${playingAyah === verse.a ? "active" : ""}`} aria-label={playingAyah === verse.a ? "إيقاف" : "تشغيل الآية"} onClick={() => playingAyah === verse.a ? stopAyahAudio() : playAyah(verse.a)}>{playingAyah === verse.a ? <Pause size={15}/> : <Play size={15}/>}</button>\n                <button className="icon-btn" aria-label={bookmarked ? \'إزالة العلامة\' : \'حفظ علامة\'} onClick={() => toggleBookmark(verse.a)}>{bookmarked ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>}</button>';
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
const result = s.replace(old, nw);
fs.writeFileSync(p, result, 'utf8');
console.log('done');
