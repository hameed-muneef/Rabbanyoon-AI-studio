// مدير المنبهات والتذكيرات الشخصية — إنشاء، تعديل، حذف، إيقاف/تشغيل، استنساخ، تأجيل.
// السحابة أولًا (Supabase RPC) والتخزين المحلي احتياطيًا عند غيابها — نفس النموذج يخدم
// تطبيقات الجوال المستقبلية لأنه نفس سجلات قاعدة البيانات نفسها.

import {useEffect, useMemo, useState} from 'react';
import {Bell, CalendarClock, Copy, PencilLine, Plus, Power, Trash2} from 'lucide-react';
import {uid} from '../../id';
import {nextDueDate, formatTimeHM} from '../../notifications/scheduler';
import {createReminder, deleteReminder, snoozeReminder, toggleReminder, updateReminder} from '../../notifications/service';
import {loadReminders, storeLocalReminder} from '../../notifications/prefs-store';
import {SoundSelectField} from './SoundPanel';
import {WEEK_DAYS} from '../../notifications/scheduler';
import {RECURRENCE_LABELS, type Reminder, type ReminderRecurrence} from '../../notifications/types';
import {notifyNativePrefsChanged} from '../../notifications/native-prayer-scheduler';

type Draft = {
  id?: string;
  title: string;
  description: string;
  date: string;
  time: string;
  recurrence: ReminderRecurrence;
  days: number[];
  intervalDays: number;
  specificDates: string;
  endDate: string;
  category: string;
  soundId: string | undefined;
  linkedGoalId: string | undefined;
};

const CATEGORY_LABELS: Record<string, string> = {
  prayer: 'الصلاة',
  reminder: 'تذكير شخصي',
  worship: 'ذكر وعمل',
  goal: 'هدف',
  task: 'مهمة',
  custom: 'عام',
};

/** قوالب إسلامية جاهزة تبرز كاقتراحات لا كإلزام — يخصصها المستخدم كما يشاء */
const TEMPLATES: {title: string; description: string; time: string; category: string}[] = [
  {title: 'أذكار الصباح', description: 'ورد الذكر الصباحي', time: '06:30', category: 'worship'},
  {title: 'أذكار المساء', description: 'ورد الذكر المسائي', time: '17:30', category: 'worship'},
  {title: 'ورد القرآن بعد الفجر', description: 'قراءة وتدبر', time: '06:00', category: 'worship'},
  {title: 'السنن الرواتب والوتر', description: 'الصلاة على الفريضة', time: '18:45', category: 'prayer'},
  {title: 'قيام الليل', description: 'قيام ما قبل الفجر', time: '04:15', category: 'worship'},
  {title: 'محاسبة النفس', description: 'حاسب نفسك قبل أن تُحاسب', time: '21:00', category: 'worship'},
  {title: 'مراجعة أهداف اليوم', description: 'تقويم خطوات اليوم وتجديد النية', time: '20:30', category: 'goal'},
];

function emptyDraft(): Draft {
  const now = new Date();
  return {
    title: '',
    description: '',
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    time: '07:00',
    recurrence: 'none',
    days: [],
    intervalDays: 2,
    specificDates: '',
    endDate: '',
    category: 'reminder',
    soundId: undefined,
    linkedGoalId: undefined,
  };
}

function draftFromReminder(reminder: Reminder): Draft {
  const at = new Date(reminder.scheduled_at);
  return {
    id: reminder.id,
    title: reminder.title,
    description: reminder.description ?? '',
    date: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`,
    time: formatTimeHM(at),
    recurrence: reminder.recurrence,
    days: reminder.recurrence_config?.days_of_week ?? [],
    intervalDays: reminder.recurrence_config?.interval_days ?? 2,
    specificDates: (reminder.recurrence_config?.specific_dates ?? []).join('، '),
    endDate: reminder.recurrence_config?.end_date ?? '',
    category: reminder.category,
    soundId: reminder.sound_id,
    linkedGoalId: reminder.linked_goal_id,
  };
}

function buildReminder(draft: Draft): Omit<Reminder, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  const scheduled_at = `${draft.date}T${draft.time}:00`;
  const base = new Date(`${draft.date}T12:00:00`);
  return {
    title: draft.title.trim().slice(0, 200),
    description: draft.description.trim().slice(0, 1000),
    scheduled_at,
    recurrence: draft.recurrence,
    recurrence_config: {
      days_of_week: draft.recurrence === 'weekdays'
        ? [...draft.days].sort((a, b) => a - b)
        : draft.recurrence === 'weekly' ? [base.getDay()] : undefined,
      start_date: draft.date,
      end_date: draft.endDate || undefined,
      specific_dates: draft.recurrence === 'specific_dates'
        ? draft.specificDates.split(/[،,]/).map(part => part.trim()).filter(Boolean)
        : undefined,
      interval_days: draft.recurrence === 'custom' ? Math.max(1, Math.round(draft.intervalDays)) : undefined,
    },
    sound_id: draft.soundId,
    category: draft.category,
    linked_goal_id: draft.linkedGoalId,
    enabled: true,
  };
}

function draftError(draft: Draft): string {
  if (!draft.title.trim()) return 'اكتب عنوان المنبه.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return 'اختر تاريخًا صحيحًا.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return 'اختر وقتًا صحيحًا.';
  if (draft.recurrence === 'weekdays' && !draft.days.length) return 'اختر يومًا واحدًا على الأقل للتكرار.';
  if (draft.recurrence === 'specific_dates' && !draft.specificDates.trim()) return 'اكتب تاريخًا واحدًا على الأقل (بفواصل بينها).';
  return '';
}

function occurrenceLabel(reminder: Reminder): string {
  const next = nextDueDate(reminder, new Date());
  if (!next) return '—';
  const day = new Intl.DateTimeFormat('ar-EG', {weekday: 'long', day: 'numeric', month: 'long'}).format(next);
  return `${day} · ${formatTimeHM(next)}`;
}

function recurrenceHint(reminder: Reminder): string {
  const config = reminder.recurrence_config ?? {};
  if (reminder.recurrence === 'weekdays' && (config.days_of_week ?? []).length) {
    return `كل ${config.days_of_week!.map(day => WEEK_DAYS[day]).join('، ')}`;
  }
  if (reminder.recurrence === 'custom') return `كل ${config.interval_days ?? 1} يومًا`;
  return RECURRENCE_LABELS[reminder.recurrence];
}

export default function RemindersPanel({notify, goals = []}: {notify: (message: string) => void; goals?: {id: string; title: string}[]}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Reminder | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const {reminders: loaded} = await loadReminders();
        if (active) setReminders(loaded);
      } catch {/* تجاهل — القائمة فارغة في البداية */}
    })();
    return () => {active = false};
  }, []);

  const saved = useMemo(() => [...reminders].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)), [reminders]);

  const withCloud = async <Row,>(cloud: () => Promise<Row>, fallback: () => Row | null): Promise<Row | null> => {
    setBusy(true);
    try {
      return await cloud();
    } catch {
      return fallback();
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!draft) return;
    const invalid = draftError(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    const values = buildReminder(draft);
    if (draft.id) {
      const cloud = () => updateReminder(draft.id!, {...values, enabled: true});
      const fallback = () => {
        setReminders(list => storeLocalReminder(list.map(item => item.id === draft.id
          ? {...item, ...values, updated_at: new Date().toISOString()}
          : item)));
        notify('حُيِّن المنبه محليًا');
        return true;
      };
      void fallback; // النفاذ المحلي للتحديث يُستدعى عند فشل السحابة
      await withCloud(async () => {
        try {
          const stored = await cloud();
          setReminders(list => storeLocalReminder(list.map(item => item.id === stored.id ? stored : item)));
          notify('حُيِّن المنبه');
        } catch {
          fallback();
        }
        return true;
      }, () => true);
    } else {
      try {
        const stored = await createReminder(values);
        setReminders(list => storeLocalReminder([...list, stored]));
        notify('أُضيف المنبه إلى حسابك');
      } catch {
        const now = new Date().toISOString();
        const local: Reminder = {
          id: uid(),
          user_id: '',
          ...values,
          created_at: now,
          updated_at: now,
        };
        setReminders(list => storeLocalReminder([...list, local]));
        notify('أُضيف المنبه محليًا (سيُزامن مع السحابة عند توفرها)');
      }
    }
    setDraft(null);
    setError('');
    notifyNativePrefsChanged();
  };

  const remove = async (reminder: Reminder) => {
    try {
      await deleteReminder(reminder.id);
    } catch {/* حذف محلي عند غياب السحابة */}
    setReminders(list => storeLocalReminder(list.filter(item => item.id !== reminder.id)));
    setConfirmDelete(null);
    notifyNativePrefsChanged();
    notify('حُذف المنبه');
  };

  const toggle = async (reminder: Reminder) => {
    const nextEnabled = !reminder.enabled;
    try {
      await toggleReminder(reminder.id, nextEnabled);
    } catch {/* تعديل محلي عند غياب السحابة */}
    setReminders(list => storeLocalReminder(list.map(item => item.id === reminder.id
      ? {...item, enabled: nextEnabled, updated_at: new Date().toISOString()}
      : item)));
    notifyNativePrefsChanged();
    notify(nextEnabled ? 'عُود تشغيل المنبه' : 'أُوقف المنبه مؤقتًا');
  };

  const duplicate = async (reminder: Reminder) => {
    try {
      const stored = await createReminder({
        title: `${reminder.title} (نسخة)`,
        description: reminder.description,
        scheduled_at: reminder.scheduled_at,
        recurrence: reminder.recurrence,
        recurrence_config: reminder.recurrence_config,
        sound_id: reminder.sound_id,
        category: reminder.category,
        linked_goal_id: reminder.linked_goal_id,
        linked_task_id: reminder.linked_task_id,
        enabled: reminder.enabled,
      });
      setReminders(list => storeLocalReminder([...list, stored]));
      notifyNativePrefsChanged();
      notify('استُنسخ المنبه');
    } catch {
      const now = new Date().toISOString();
      setReminders(list => storeLocalReminder([...list, {
        id: uid(),
        user_id: reminder.user_id,
        title: `${reminder.title} (نسخة)`,
        description: reminder.description,
        scheduled_at: reminder.scheduled_at,
        recurrence: reminder.recurrence,
        recurrence_config: reminder.recurrence_config,
        sound_id: reminder.sound_id,
        category: reminder.category,
        linked_goal_id: reminder.linked_goal_id,
        linked_task_id: reminder.linked_task_id,
        enabled: reminder.enabled,
        created_at: now,
        updated_at: now,
      }]));
      notifyNativePrefsChanged();
      notify('استُنسخ المنبه محليًا');
    }
  };

  const snooze = async (reminder: Reminder) => {
    try {
      const stored = await snoozeReminder(reminder.id, 10);
      setReminders(list => storeLocalReminder(list.map(item => item.id === stored.id ? stored : item)));
      notifyNativePrefsChanged();
      notify('أُجّل المنبه 10 دقائق');
    } catch {
      const until = new Date(Date.now() + 10 * 60000).toISOString();
      setReminders(list => storeLocalReminder(list.map(item => item.id === reminder.id
        ? {...item, snooze_until: until, updated_at: new Date().toISOString()}
        : item)));
      notifyNativePrefsChanged();
      notify('أُجّل المنبه 10 دقائق');
    }
  };

  const editing = draft !== null;

  return (
    <div className="notif-reminders">
      {!editing && (
        <button type="button" className="primary" onClick={() => {setDraft(emptyDraft());setError('')}}>
          <Plus size={16}/> منبه جديد
        </button>
      )}

      {editing && draft && (
        <form className="notif-reminder-form" onSubmit={event => {event.preventDefault();void submit()}} noValidate>
          <h3>{draft.id ? 'تعديل المنبه' : 'منبه جديد'}</h3>
          <label>العنوان
            <input type="text" value={draft.title} maxLength={200} placeholder="مثل: ورد القرآن بعد الفجر"
              onChange={event => setDraft({...draft, title: event.target.value})}/>
          </label>
          <label>الوصف (اختياري)
            <input type="text" value={draft.description} maxLength={1000}
              onChange={event => setDraft({...draft, description: event.target.value})}/>
          </label>
          <div className="form-grid">
            <label>التاريخ
              <input type="date" value={draft.date} onChange={event => setDraft({...draft, date: event.target.value})}/>
            </label>
            <label>الوقت
              <input type="time" dir="ltr" value={draft.time} onChange={event => setDraft({...draft, time: event.target.value})}/>
            </label>
          </div>
          <label>التكرار
            <select value={draft.recurrence} onChange={event => {
              const recurrence = event.target.value as ReminderRecurrence;
              setDraft({...draft, recurrence, days: recurrence === 'weekdays' && !draft.days.length ? [1, 2, 3, 4, 5] : draft.days});
            }}>
              {(['none', 'daily', 'weekdays', 'weekly', 'monthly', 'custom', 'specific_dates'] as ReminderRecurrence[])
                .map(option => <option key={option} value={option}>{RECURRENCE_LABELS[option]}</option>)}
            </select>
          </label>
          {draft.recurrence === 'weekdays' && (
            <fieldset className="notif-days">
              <legend>أيام التكرار</legend>
              {WEEK_DAYS.map((label, day) => (
                <label key={label} className="notif-day">
                  <input type="checkbox" checked={draft.days.includes(day)}
                    onChange={event => setDraft({
                      ...draft,
                      days: event.target.checked ? [...draft.days, day] : draft.days.filter(item => item !== day),
                    })}/>
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {draft.recurrence === 'custom' && (
            <label>كل كم يوم؟
              <input type="number" min={1} max={366} value={draft.intervalDays}
                onChange={event => setDraft({...draft, intervalDays: Number(event.target.value)})}/>
            </label>
          )}
          {draft.recurrence === 'specific_dates' && (
            <label>تواريخ محددة (بفواصل، بصيغة YYYY-MM-DD)
              <input type="text" dir="ltr" value={draft.specificDates} placeholder="2026-11-05, 2026-11-12"
                onChange={event => setDraft({...draft, specificDates: event.target.value})}/>
            </label>
          )}
          {(draft.recurrence === 'weekly' || draft.recurrence === 'monthly') && (
            <label>تاريخ النهاية (اختياري)
              <input type="date" value={draft.endDate} onChange={event => setDraft({...draft, endDate: event.target.value})}/>
            </label>
          )}
          <div className="form-grid">
            <label>التصنيف
              <select value={draft.category} onChange={event => setDraft({...draft, category: event.target.value})}>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>الصوت
              <SoundSelectField value={draft.soundId} onChange={id => setDraft({...draft, soundId: id})}/>
            </label>
          </div>
          {goals.length > 0 && (
            <label>ربط بهدف (اختياري)
              <select value={draft.linkedGoalId ?? ''} onChange={event => setDraft({...draft, linkedGoalId: event.target.value || undefined})}>
                <option value="">بلا ربط</option>
                {goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
              </select>
            </label>
          )}
          {error && <p role="alert" className="notif-error">{error}</p>}
          <div className="notif-form-actions">
            <button type="submit" className="primary" disabled={busy}>{draft.id ? 'حفظ التعديل' : 'إضافة'}</button>
            <button type="button" className="soft-btn" onClick={() => {setDraft(null);setError('')}}>إلغاء</button>
          </div>
        </form>
      )}

      {!editing && saved.length === 0 && (
        <p className="muted notif-empty"><Bell size={15}/> لا منبهات بعد. أضف منبهًا أو اختر أحد القوالب الجاهزة أدناه — القوالب اقتراحات تُعدَّل كما تشاء.</p>
      )}

      {!editing && saved.length > 0 && (
        <ul className="notif-reminder-list">
          {saved.map(reminder => (
            <li key={reminder.id} className={reminder.enabled ? '' : 'paused'}>
              <div className="notif-reminder-main">
                <strong>{reminder.title}</strong>
                <small className="muted">{recurrenceHint(reminder)}{reminder.description ? ` · ${reminder.description}` : ''}</small>
                <small className="muted"><CalendarClock size={13}/> الموعد القادم: {occurrenceLabel(reminder)}{reminder.snooze_until ? ' · مؤجل مؤقتًا' : ''}</small>
                <small className="muted">{CATEGORY_LABELS[reminder.category] ?? reminder.category}</small>
              </div>
              <div className="notif-reminder-actions">
                <button type="button" className="soft-btn" onClick={() => {setDraft(draftFromReminder(reminder));setError('')}} aria-label={`تعديل ${reminder.title}`}><PencilLine size={15}/></button>
                <button type="button" className="soft-btn" onClick={() => void toggle(reminder)} aria-label={reminder.enabled ? 'إيقاف مؤقت' : 'إعادة تشغيل'}><Power size={15}/></button>
                <button type="button" className="soft-btn" onClick={() => void duplicate(reminder)} aria-label="استنساخ"><Copy size={15}/></button>
                <button type="button" className="soft-btn" onClick={() => void snooze(reminder)} aria-label="تأجيل 10 دقائق"><Bell size={15}/></button>
                <button type="button" className="soft-btn danger" onClick={() => setConfirmDelete(reminder)} aria-label="حذف"><Trash2 size={15}/></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!editing && confirmDelete && (
        <div className="notif-confirm" role="alertdialog" aria-label="تأكيد الحذف">
          <p>حذف «{confirmDelete.title}» نهائيًا؟</p>
          <div>
            <button type="button" className="soft-btn danger" onClick={() => void remove(confirmDelete)}>حذف</button>
            <button type="button" className="soft-btn" onClick={() => setConfirmDelete(null)}>إلغاء</button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="notif-templates">
          <h4>قوالب جاهزة (اختيارية)</h4>
          <div className="notif-template-grid">
            {TEMPLATES.map(template => (
              <button type="button" key={template.title} className="soft-btn notif-template"
                onClick={() => {
                  const now = new Date();
                  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                  setDraft({...emptyDraft(), title: template.title, description: template.description, time: template.time, category: template.category, recurrence: 'daily', date});
                }}>
                <strong>{template.title}</strong>
                <small>{template.time}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
