// نظام ألوان الأقسام: مصدر واحد للقيم، تُولَّد منه متغيرات CSS (فاتح وداكن).
// لإضافة قسم جديد: أضف عنصرًا إلى SECTION_THEMES وربط شاشاته في views، ولا حاجة لتعديل CSS.

import type {View} from './app-state';

export type SectionId = 'quran' | 'haramain' | 'journey' | 'daily' | 'tazkiya' | 'accountability' | 'planning' | 'strong';

export type SectionTheme = {
  id: SectionId;
  label: string;
  accent: string;
  soft: string;
  views: View[];
};

export const SECTION_THEMES: SectionTheme[] = [
  {id: 'quran', label: 'القرآن والسنة', accent: '#174C3C', soft: '#9BBEC5', views: ['quran']},
  {id: 'haramain', label: 'من الحرمين الشريفين', accent: '#8A6A38', soft: '#E5D9C0', views: ['haramain']},
  {id: 'journey', label: 'السير إلى الله', accent: '#527F8B', soft: '#D3E2E0', views: []},
  {id: 'daily', label: 'يومي مع الله', accent: '#32412F', soft: '#B99A5D', views: ['day', 'tasks']},
  {id: 'tazkiya', label: 'زكِّ نفسك', accent: '#294039', soft: '#A8B9A0', views: ['wird']},
  {id: 'accountability', label: 'حاسب نفسك', accent: '#876D83', soft: '#729EAA', views: ['reflect']},
  {id: 'planning', label: 'أسبوعي مع الله / شهري مع الله', accent: '#477A70', soft: '#C1D9DC', views: ['week', 'month']},
  {id: 'strong', label: 'المؤمن القوي', accent: '#344C83', soft: '#D5DFD1', views: ['goals']},
];

export const LIGHT_SURFACE = '#F3F0E7';
// سطح الداكن المعتمد: فحمي مخضرّ متوسط (مطابق لـ --dark-surface-canvas) —
// معايرة الألوان الداكنة تضمن AA ضدّه + أسطح اللوح المرتفعة.
export const DARK_SURFACE = '#2E2822';
export const DARK_RAISED = '#474036';
export const MIN_TEXT_CONTRAST = 4.5;

export function sectionOfView(view: View): SectionId | undefined {
  return SECTION_THEMES.find(theme => theme.views.includes(view))?.id;
}

const channels = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const toHex = (values: number[]) => '#' + values.map(value => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('').toUpperCase();

export function mix(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  return toHex(a.map((value, index) => value + (b[index] - value) * amount));
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(value => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** أقل تعديل للّون نحو الهدف يحقق التباين المطلوب مع كل الخلفيات المعطاة */
function tune(color: string, toward: string, against: string[], min = MIN_TEXT_CONTRAST): string {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(color, toward, step / 20);
    if (against.every(background => contrast(candidate, background) >= min)) return candidate;
  }
  return toward;
}

export type SectionPalette = {accent: string; soft: string; strong: string; strongHover: string; onStrong: string};

/** accent للأيقونات والتقدم والحدود؛ strong (أقل تغميق ممكن) للنص والأزرار */
export function lightPalette(theme: SectionTheme): SectionPalette {
  const strong = tune(theme.accent, '#000000', ['#FFFFFF', theme.soft, LIGHT_SURFACE]);
  return {accent: theme.accent, soft: theme.soft, strong, strongHover: mix(strong, '#000000', 0.18), onStrong: '#FFFFFF'};
}

export function darkPalette(theme: SectionTheme): SectionPalette {
  const soft = mix(DARK_SURFACE, theme.accent, 0.22);
  const accent = tune(theme.accent, '#FFFFFF', [DARK_SURFACE, soft, DARK_RAISED], 3);
  const strong = tune(theme.accent, '#FFFFFF', [DARK_SURFACE, soft, DARK_RAISED]);
  return {accent, soft, strong, strongHover: mix(strong, '#FFFFFF', 0.15), onStrong: DARK_SURFACE};
}

const declarations = (palette: SectionPalette) =>
  `--section-accent:${palette.accent};--section-soft:${palette.soft};--section-strong:${palette.strong};--section-strong-hover:${palette.strongHover};--section-on-strong:${palette.onStrong};`;

/** CSS المولَّد: [data-section] فاتحًا، و[data-theme="dark"] داكنًا */
export function sectionThemeCss(themes: SectionTheme[] = SECTION_THEMES): string {
  const light = themes.map(theme => `[data-section="${theme.id}"]{${declarations(lightPalette(theme))}}`).join('\n');
  const dark = themes.map(theme => `[data-theme="dark"] [data-section="${theme.id}"],[data-theme="dark"][data-section="${theme.id}"]{${declarations(darkPalette(theme))}}`).join('\n');
  return `${light}\n${dark}\n`;
}

export function installSectionTheme(doc: Document = document): void {
  if (doc.getElementById('section-theme')) return;
  const style = doc.createElement('style');
  style.id = 'section-theme';
  style.textContent = sectionThemeCss();
  doc.head.appendChild(style);
}
