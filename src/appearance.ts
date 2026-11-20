// مظهر المنصة: فاتح/داكن/تلقائي. يطبّق `data-theme` على <html>، يحفظ الاختيار،
// ويرجع تفضيل نظام التشغيل في «تلقائي». المكوّنات تقرأ عبر `resolvedTheme`/الأحداث.

export type Appearance = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'rabbani-theme-v1';
export const APPEARANCE_EVENT = 'rabbani-appearance';

export function isAppearance(value: unknown): value is Appearance {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readAppearance(storage: Pick<Storage, 'getItem'> | null): Appearance {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    if (isAppearance(value)) return value;
  } catch {/* التخزين قد يكون مقفولًا */}
  return 'system';
}

/** وصول آمن للتخزين: قد يُمنع في الإطارات المضمَّنة أو وضع الخصوصية — لا يُسقط التطبيق. */
export function safeLocalStorage(win: Pick<Window, 'localStorage'>): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {return win.localStorage} catch {return null}
}

export function saveAppearance(storage: Pick<Storage, 'setItem'> | null, value: Appearance): void {
  try {storage?.setItem(STORAGE_KEY, value)} catch {/* تجاهل */}
}

/** يحسم الوضع النهائي: «تلقائي» يفهرس تفضيل النظام. */
export function resolvedTheme(mode: Appearance, systemPrefersDark: boolean): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}

export function systemDark(): boolean {
  try {return window.matchMedia('(prefers-color-scheme: dark)').matches} catch {return false}
}

/** يطبّق الوضع الفعلي على المستند: السمة + لون شريط المتصفح. */
export function applyTheme(mode: Appearance, doc: Document = document): void {
  const dark = resolvedTheme(mode, systemDark()) === 'dark';
  const root = doc.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#08192B' : '#173F35');
}

export function installAppearance(doc: Document = document, win: Window = window): void {
  const storage = safeLocalStorage(win);
  let mode = readAppearance(storage);
  applyTheme(mode, doc);
  win.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      mode = readAppearance(safeLocalStorage(win));
      applyTheme(mode, doc);
    }
  });
  try {
    const mq = win.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {if (mode === 'system') applyTheme(mode, doc)};
    mq.addEventListener?.('change', onChange);
  } catch {/* متصفح بلا matchMedia */}
}

export function setAppearance(value: Appearance, doc: Document = document, win: Window = window): void {
  const storage = safeLocalStorage(win);
  saveAppearance(storage, value);
  applyTheme(value, doc);
  win.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, {detail: value}));
  // خصائص متعددة التبويبات
  const local = readAppearance(storage);
  if (local !== value) saveAppearance(storage, value);
}

export function currentAppearance(win: Window = window): Appearance {
  return readAppearance(safeLocalStorage(win));
}

export {STORAGE_KEY};
