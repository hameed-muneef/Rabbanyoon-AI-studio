import {useEffect, useState} from 'react';
import {BookOpen, CheckCircle2, RefreshCw, ShieldAlert, XCircle} from 'lucide-react';
import {authClient} from '../auth';

// لوحة مراجعة محتوى القرآن والسنة: للعرض والفحص فقط.
// لا تحتوي أي حقل لتعديل نص الآيات أو الأحاديث؛ التصحيح يكون باستيراد
// إصدار مصدر جديد من الخادم، ويبقى السجل السابق قابلًا للتدقيق.

type ImportRow = {
  kind: 'quran' | 'hadith';
  key: string;
  title: string;
  license_status: string;
  import_status: string;
  imported_count: number;
  expected_count: number | null;
  version: string;
  sha256: string;
  updated_at: string;
};

type IntegrityRow = {check_name: string; passed: boolean; detail: string};

const licenseLabel: Record<string, string> = {
  approved: 'مرخص',
  pending: 'قيد المراجعة',
  blocked: 'غير مرخص'
};
const importLabel: Record<string, string> = {
  complete: 'مكتمل',
  partial: 'جزئي',
  not_imported: 'لم يُستورد'
};
const kindLabel: Record<string, string> = {quran: 'المصحف الشريف', hadith: 'الحديث'};
const checkLabel: Record<string, string> = {
  active_source: 'إصدار نشط',
  surahs: 'عدد السور',
  verses: 'عدد الآيات',
  duplicates: 'تكرار الآيات',
  ordering: 'ترتيب الآيات داخل السور',
  checksum: 'بصمة الأصل المشتق'
};

export default function QuranContentAdminPanel() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [checks, setChecks] = useState<IntegrityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!authClient) {
      setLoading(false);
      setError('خدمة قاعدة البيانات غير مفعّلة في هذه البيئة.');
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      authClient.rpc('content_import_overview'),
      authClient.rpc('quran_content_integrity')
    ])
      .then(([overview, integrity]) => {
        if (!active) return;
        if (overview.error) throw new Error(overview.error.message);
        if (integrity.error) throw new Error(integrity.error.message);
        setRows((overview.data ?? []) as ImportRow[]);
        setChecks((integrity.data ?? []) as IntegrityRow[]);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل حالة المحتوى.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  return <section className="panel quran-admin-panel" dir="rtl">
    <div className="quran-admin-head">
      <div>
        <span className="admin-eyebrow"><BookOpen size={15}/> محتوى القرآن والسنة</span>
        <h2>حالة المصادر والسلامة</h2>
        <p>عرض للقراءة فقط. النصوص المصدرية غير قابلة للتعديل من الواجهة؛ التصحيح باستيراد إصدار مصدر موثق جديد.</p>
      </div>
      <button className="soft-btn" onClick={() => setRevision(value => value + 1)} disabled={loading}>
        <RefreshCw size={15}/> {loading ? 'جارٍ الفحص…' : 'إعادة الفحص'}
      </button>
    </div>

    {error && <div className="admin-cleanup-warning" role="alert"><p>{error}</p></div>}

    {!error && <>
      <h3>الإصدارات المستوردة</h3>
      {rows.length === 0 && !loading ? <p className="muted">لا توجد إصدارات مسجلة بعد.</p> : <div className="quran-admin-table-wrap">
        <table className="quran-admin-table">
          <thead><tr>
            <th>النوع</th><th>المفتاح</th><th>العنوان</th><th>الترخيص</th><th>الاستيراد</th>
            <th>العدد</th><th>الإصدار</th><th>البصمة</th><th>آخر تحديث</th>
          </tr></thead>
          <tbody>
            {rows.map(row => <tr key={`${row.kind}:${row.key}`}>
              <td>{kindLabel[row.kind] ?? row.kind}</td>
              <td><code>{row.key}</code></td>
              <td>{row.title}</td>
              <td><span className={`quran-admin-badge ${row.license_status}`}>{licenseLabel[row.license_status] ?? row.license_status}</span></td>
              <td><span className={`quran-admin-badge ${row.import_status}`}>{importLabel[row.import_status] ?? row.import_status}</span></td>
              <td>{row.expected_count == null ? String(row.imported_count) : `${row.imported_count} / ${row.expected_count}`}</td>
              <td><code>{row.version}</code></td>
              <td>{row.sha256 ? <code title={row.sha256}>{row.sha256.slice(0, 12)}…</code> : '—'}</td>
              <td>{row.updated_at ? new Date(row.updated_at).toLocaleDateString('ar') : '—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}

      <h3>فحص سلامة النص القرآني</h3>
      {checks.length === 0 && !loading ? <p className="muted">لا توجد نتائج فحص بعد تطبيق ترحيل المحتوى واستيراد الإصدار.</p> : <ul className="quran-admin-checks">
        {checks.map(check => <li key={check.check_name} className={check.passed ? 'passed' : 'failed'}>
          {check.passed ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}
          <span><strong>{checkLabel[check.check_name] ?? check.check_name}</strong> — {check.detail}</span>
        </li>)}
      </ul>}

      <div className="quran-admin-note" role="note">
        <ShieldAlert size={17}/>
        <p>الصحيحان معروضان بحالة «غير مرخص / لم يُستورد» حتى تتوفر نسخة كاملة مرخصة مع تحديد الطبعة ونظام الترقيم. لا تُعرض أحاديث ناقصة، ولا تُخترع درجات صحة أو شروح. التفاصيل في <code>docs/QURAN_SUNNAH_CONTENT_SOURCES.md</code>.</p>
      </div>
    </>}
  </section>;
}
