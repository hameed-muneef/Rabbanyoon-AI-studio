import {useEffect,useMemo,useRef,useState} from 'react';
import {CheckCircle2, Eye, EyeOff, Mic, RotateCcw, Square, Volume2} from 'lucide-react';
import type {MemorizationPassage, QuranAsset} from '../../quran/types';
import {normalizeSearch, referenceLabel, toArabicNumber, verseBody} from '../../quran/content';

type Props = {
  asset: QuranAsset;
  passage: MemorizationPassage;
  notify: (text: string) => void;
  onMemorized?: () => void;
  onRate?: (quality: number) => void;
};

type Exercise = 'read' | 'hide' | 'first' | 'blank' | 'order' | 'recall';

const EXERCISES: {value: Exercise; label: string}[] = [
  {value: 'read', label: 'قراءة'},
  {value: 'hide', label: 'إخفاء الآيات'},
  {value: 'first', label: 'أول الكلمة'},
  {value: 'blank', label: 'املأ الفراغ'},
  {value: 'order', label: 'ترتيب الآيات'},
  {value: 'recall', label: 'استرجاع كامل'}
];

export default function PassagePractice({asset, passage, notify, onMemorized, onRate}: Props) {
  const verses = useMemo(() => {
    if (passage.surah == null || passage.ayahStart == null || passage.ayahEnd == null) return [];
    return asset.verses.filter(verse => verse.s === passage.surah && verse.a >= passage.ayahStart! && verse.a <= passage.ayahEnd!);
  }, [asset, passage.surah, passage.ayahStart, passage.ayahEnd]);
  const [exercise, setExercise] = useState<Exercise>('read');
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [blankChecked, setBlankChecked] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [shuffled, setShuffled] = useState<number[]>([]);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const reset = (next: Exercise) => {
    setExercise(next);
    setRevealed(new Set());
    setAnswers({});
    setBlankChecked(false);
    setOrder([]);
    if (next === 'order') {
      const numbers = verses.map(verse => verse.a);
      for (let index = numbers.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [numbers[index], numbers[swap]] = [numbers[swap], numbers[index]];
      }
      setShuffled(numbers);
    }
  };

  useEffect(() => {
    setExercise('read');
    setRevealed(new Set());
    setAnswers({});
    setBlankChecked(false);
    setOrder([]);
    setShuffled([]);
    setAudioUrl(current => { if (current) URL.revokeObjectURL(current); return ''; });
  }, [passage.id]);

  useEffect(() => () => {
    stream.current?.getTracks().forEach(track => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      notify('تسجيل الصوت غير مدعوم في هذا المتصفح.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({audio: true});
      stream.current = media;
      const chunks: BlobPart[] = [];
      const instance = new MediaRecorder(media);
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => {
        const blob = new Blob(chunks, {type: instance.mimeType || 'audio/webm'});
        setAudioUrl(current => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob); });
        media.getTracks().forEach(track => track.stop());
        stream.current = null;
      };
      recorder.current = instance;
      instance.start();
      setRecording(true);
      notify('بدأ التسجيل المحلي بإذنك. لا يُرفع إلى الخادم.');
    } catch {
      notify('لم يُمنح إذن الميكروفون؛ يمكنك متابعة الاختبار دون تسجيل.');
    }
  };

  const stopRecording = () => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  };

  const words = (text: string) => verseBody(text).split(/\s+/).filter(Boolean);
  const hiddenWordIndex = (text: string) => Math.max(0, words(text).length - 1);
  const blankCorrect = (verse: {a: number; t: string}) => {
    const list = words(verse.t);
    const index = hiddenWordIndex(verse.t);
    return normalizeSearch(answers[verse.a] ?? '') === normalizeSearch(list[index] ?? '');
  };

  const passageLabel = passage.surah != null && passage.ayahStart != null
    ? referenceLabel(asset, passage.surah, passage.ayahStart, passage.ayahEnd) : 'مقطع';

  return <div className="quran-practice">
    <header className="quran-practice-head">
      <div><span className="eyebrow">تدريب</span><h3>{passageLabel}</h3><p className="muted small">{toArabicNumber(verses.length)} آية · الحالة: {passage.state === 'mastered' ? 'راسخ' : passage.state === 'good' ? 'جيد' : passage.state === 'needs_revision' ? 'يحتاج مراجعة' : passage.state === 'learning' ? 'يتعلم' : 'لم يبدأ'}</p></div>
      <div className="quran-exercise-tabs">{EXERCISES.map(item => <button key={item.value} className={exercise === item.value ? 'primary' : 'soft-btn'} onClick={() => reset(item.value)}>{item.label}</button>)}</div>
    </header>

    <div className="quran-practice-verses">
      {verses.map(verse => {
        const hidden = exercise === 'recall' ? !revealed.has(verse.a)
          : exercise === 'hide' ? !revealed.has(verse.a)
          : exercise === 'first' ? !revealed.has(verse.a)
          : false;
        const list = words(verse.t);
        const firstWord = list[0] ?? '';
        const blankIndex = hiddenWordIndex(verse.t);
        return <article key={verse.a} className="quran-practice-verse">
          <div className="quran-practice-text" style={{fontFamily: '"KFGQPC HAFS Uthmanic Script","Amiri Quran",serif'}}>
            {exercise === 'blank' ? <>
              {list.map((word, index) => index === blankIndex
                ? <span key={index} className="quran-blank">
                    <input aria-label={`الكلمة الناقصة في الآية ${verse.a}`} value={answers[verse.a] ?? ''} onChange={event => setAnswers(current => ({...current, [verse.a]: event.target.value}))}/>
                    {blankChecked && <span className={blankCorrect(verse) ? 'quran-correct' : 'quran-wrong'}>{blankCorrect(verse) ? '✓' : list[blankIndex]}</span>}
                  </span>
                : <span key={index}>{word} </span>)}
            </> : hidden ? <span className="quran-hidden-passage">{exercise === 'first' ? `${firstWord} …` : '••••••••••••••••••'}</span>
              : verseBody(verse.t)}
            <span className="quran-verse-marker">۝{toArabicNumber(verse.a)}</span>
          </div>
          <div className="quran-practice-actions">
            <small>{referenceLabel(asset, verse.s, verse.a)}</small>
            {hidden && <button className="soft-btn" onClick={() => setRevealed(current => new Set(current).add(verse.a))}><Eye size={14}/> إظهار</button>}
            {!hidden && exercise !== 'read' && exercise !== 'blank' && <button className="soft-btn" onClick={() => setRevealed(current => { const next = new Set(current); next.delete(verse.a); return next; })}><EyeOff size={14}/> إخفاء</button>}
          </div>
        </article>;
      })}
    </div>

    {exercise === 'blank' && <div className="quran-practice-footer">
      <button className="primary" onClick={() => setBlankChecked(true)}><CheckCircle2 size={16}/> تحقق من الإجابات</button>
      <button className="soft-btn" onClick={() => { setAnswers({}); setBlankChecked(false); }}><RotateCcw size={16}/> إعادة</button>
    </div>}

    {exercise === 'order' && <div className="quran-order">
      <h4>رتّب الآيات بالضغط عليها بالترتيب</h4>
      <div className="quran-order-chips">{shuffled.map(number => <button key={number} className={order.includes(number) ? 'selected' : ''} disabled={order.includes(number)} onClick={() => setOrder(current => [...current, number])}>{toArabicNumber(number)}</button>)}</div>
      <div className="quran-order-result">
        <p>اختيارك: {order.length ? order.map(toArabicNumber).join(' ← ') : '—'}</p>
        <p>{order.length === verses.length ? (order.every((number, index) => number === verses[index].a) ? '✓ ترتيب صحيح' : '✗ أعد المحاولة') : `بقي ${toArabicNumber(verses.length - order.length)} آية`}</p>
        <button className="soft-btn" onClick={() => reset('order')}><RotateCcw size={15}/> خلط جديد</button>
      </div>
    </div>}

    <div className="quran-audio-local panel">
      <div>
        <strong><Volume2 size={16}/> التلاوة الصوتية</strong>
        <p className="muted small">لا تُعرض تلاوة حتى تُعتمد مصادر صوتية مرخصة. التسجيل أدناه لصوتك فقط، ويبقى على جهازك ولا يُرفع.</p>
      </div>
      <div className="quran-record-actions">
        {recording ? <button className="primary" onClick={stopRecording}><Square size={15}/> إيقاف التسجيل</button>
          : <button className="soft-btn" onClick={() => void startRecording()}><Mic size={15}/> تسجيل صوتي محلي</button>}
        {audioUrl && <audio controls src={audioUrl} aria-label="تسجيل صوتي محلي للمراجعة"/>}
      </div>
    </div>

    {onMemorized && <div className="quran-practice-footer">
      <button className="primary" onClick={onMemorized}><CheckCircle2 size={16}/> أتممت حفظ هذا المقطع</button>
      <p className="muted small">يبدأ الحفظ فورًا بمراجعة مباشرة، ولا يصبح المقطع «راسخًا» إلا بعد مراجعات ناجحة متتابعة.</p>
    </div>}

    {onRate && <div className="quran-practice-footer quran-rate">
      <p><strong>كيف كان استرجاعك؟</strong></p>
      <div className="quran-rate-buttons">
        <button className="soft-btn" onClick={() => onRate(1)}>تعثرت — أعد</button>
        <button className="soft-btn" onClick={() => onRate(3)}>جيد</button>
        <button className="primary" onClick={() => onRate(4)}>راسخ</button>
        <button className="soft-btn" onClick={() => onRate(5)}>راسخ جدًا</button>
      </div>
    </div>}
  </div>;
}
