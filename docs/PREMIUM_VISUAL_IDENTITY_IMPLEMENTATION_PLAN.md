# خطة الهوية البصرية الراقية (Premium Visual Identity) — تنفيذ

> آخر تحديث: 2026-11-03. هذه وثيقة تنفيذ حية تُزامَن مع التقدم.

## 1. تقييم الوضع الحالي

### الموجود أصلاً (يعاد البناء عليه، لا من الصفر)

- **`src/section-theme.ts`** — 7 هويات أقسام بنفس اللوحة المطلوبة بالضبط
  (emerald `#174C3C`/sage، teal blue، amber، olive، plum، turquoise، slate blue)، مع
  معايرةURIComponent WCAG AA فاتح/داكن مولّدة ديناميكيًا واختبارات `tests/section-theme.test.mjs` تثبت العقد.
- **`src/section-theme.css`** — يرمّم الرموز على `main[data-section]`: الأزرار والأيقونات
  وحدود البطاقات وخطوط التقدم وتحديد النص والتركيز وحالة الشريط الجانبي النشط.
- **`src/brand-identity.css`** — رموز الهوية العامة (forest/ivory/antique gold، خطوط
  IBM Plex Sans Arabic + Cairo + Amiri)، تُحمّل تالًا فتسود.
- **`src/design-system.css`** — تغليف قشرة التطبيق (sidebar/topbar/content) برموز مركزية.
- الخطوط محمّلة في `index.html` (Amiri/Cairo/IBM Plex Sans Arabic/Tajawal).

### الفجوات المرصودة (مقياس هذه الخطة)

1. **الوضع الداكن غير موصول**: رمز `[data-theme="dark"]` موجود في section-theme لكن لا
   شيء في التطبيق يضبطه أبدًا — لا زر تبديل ولا تفضيل نظام ولا استمرارية.
2. الخلفيات مسطحة/mكررة (`--color-canvas` واحد بلا طبقات أو أنماط).
3. لا لغة زخرفية (فواصل، أرسومة هندسية، حدود جانبية ملونة للبطاقات).
4. `styles.css` الأساس (محمل أولًا) قديم بألوان صلبة `#F8F6EF` إلخ؛ الملفات اللاحقة
   تطغى على معظمها لكن لا تغطي كل شيء (توست، hint، prayer, wires…).
5. ملفات-domain كبيرة (day-planner 37KB, quran 36KB, learning-redesign 24KB…) تستخدم
   قيمًا صلبة جزئيًا — يعالَج توكِنيًا حيث أمكن دون كتابة ألوان جديدة داخلها.
6. لا توجد اختبارات لرموز الأسطح/الحالتين فاتح وداكن خارج section-theme.

### مقياس النطاق

`styles.css` (14KB) و`design-system.css` (21KB) و`brand-identity.css` (13KB) و
`notifications.css` وشل أبرز ملفات الأقسام. ملفات القرآن/التعلم العميقة تُلمس من
الوتر المركزي فقط إن لزم (لها أنماطها الداخلية المستقرة ودارك لقارئ القرآن موجود).

## 2. نظام الألوان المعتمد

### هويات الأقسام (ثابتة — مطابقة للوحة المطلوبة، مُعايرة AA آليًا في section-theme.ts)

| القسم | accent | soft |
|---|---|---|
| القرآن والسنة (`quran`) | `#174C3C` | `#E3EADF` |
| السير إلى الله (`journey`) | `#477A8A` | `#E1EAEC` |
| يومي مع الله (`daily`) | `#A17B42` | `#F0E7D7` |
| زكِّ نفسك (`tazkiya`) | `#647C68` | `#E5E9DE` |
| حاسب نفسك (`accountability`) | `#876D83` | `#EAE4E9` |
| أسبوعي/شهري مع الله (`planning`) | `#477A70` | `#E1EBE7` |
| المؤمن القوي (`strong`) | `#68758D` | `#E3E8ED` |

### رموز الطبقات الجديدة (تًضاف إلى brand-identity.css ومستوى premium جديد)

- أسطح المرتبطة: `--surface-canvas/surface/surface-raised/surface-sunken`
  فاتح: عاج دافئ `#F6F1E7` → `#FBF8F1` → `#FFFFFF`؛ داكن: `#171D1A` → `#1F2723` → `#242E29`.
- درج الظلال: `--shadow-1..3` بلاطات منخفضة طبقية (بدل ظل واحد مسطح).
- خطوط زخرفية: `--line-ornament` بلون accent المخلول 35%.
- هندسية: نمط نجمة ثمانية/شبكة إسلامية SVG data-URI بشفافية 3-5% للخلفيات الكبيرة فقط.
- مطاطة: `--grad-surface` تدرج قطري ناعم بين سطحين متجاورين؛ وأصل الهيدر
  `--grad-hero` بمزج accent+deep بنسبة محسوبة.

قاعدة صارمة: **لا ألوان hex جديدة داخل المكوّنات**؛ الجديد فقط في طبقة الرموز.

## 3. خطة إعادة تصميم المكونات

1. **الخلفيات**: canvas عاجي دافئ كطبقة أساس + نمط هندسي الخافت على الـviewport فقط
   (خارج المحتوى الطويل)، وطبقة surface للقشرة، وتدرج شريط علوي خافت بلون القسم،
   وأشكال منحنية ناعمة أسفل الروائع (hero) عبر radial-gradient.
   **ممنوع النمط خلف نص الفقرات أو الآيات.**
2. **البطاقات**: `.panel/.feature-card/.wide-card/.wird-card...` سطح متعدد الطبقات
   (`surface-raised`)، خط جانبي 3px بلون القسم (via border-inline-start)، حد 1px
   `--line-card`، ظل درج 1، تظليل تقويمي عند hover (translateY(-2px) + shadow2)،
   عنوان بتاج مقسم (rule) زخرفي رفيع؛ أيقونات داخل حاوية soft بلون القسم.
3. **الأزرار**: primary = خلفية section-strong (الموجود) لكن بظل خافت ورِقّة أبعاد
   (radius 10، ارتفاع 42). ثانوية soft بحد. tertiary شفاف. خطير محفوظ. حالات
   hover/active/disabled/focus موحّدة الملموسة (focus-ring من --color-focus الذهبي).
4. **الأيقونات**: lucide موحّد (موجود)؛ duotone بإناء soft-strong الموجود، موحّد الحجم
   (20/18/16) ودورات دوران قليلة.
5. **فواصل أقسام**: `.section-rule` (خط 2px متدرج accent→شفاف) وفاصل زخرفي مركزي
   `◆` رفيع للفواصل بين أيقونات القصص.
6. **التنقل**: sidebar زجاجي فاتح (surface) مع نشط ذي شريط جانبي ملون بقسمه (موجود)
   + mark خلفية soft؛ مبايل nav يرفع surface مع ظل علوي.
7. **الإشعارات والمحاور (NotificationCenter/LiveNotifications/toast)**: ألوانها من
   الرموز بدل هاردكود في notifications.css/styles.css.
8. **الحالات**: selected → بسرد soft+dashed dx؟ (سيحدد T2)، loading (skeleton shimmer)
   بلا ظل.

## 4. مراحل التنفيذ

- [x] **P0 التقييم**: جرد الملفات والرموز والفجوات (هذه الوثيقة §1).
- [x] **P1 رموز + الوضع الداكن جهازية**:
  - `src/appearance.ts` (جديد): `readAppearance/saveAppearance/resolvedTheme/applyTheme/installAppearance/setAppearance`؛
    يضبط `data-theme` على `<html>` ولون `theme-color` ويحفظ `localStorage['rabbani-theme-v1']`
    مع دعم `system` + مزامنة التبويبات (`storage` event) + تفضيل النظام الحي.
  - `src/AppearanceToggle.tsx` (جديد): زر دورة (تلقائي→نهاري→ليلي) في top-actions
    + `AppearancePanel` (سبانكت radio) في الإعدادات؛ hook مشترك `useAppearance`
    مبني على `currentAppearance` (مصدر واحد للقراءة).
  - رموز طبقية في `brand-identity.css`: سلم أسطح (canvas/page/surface/raised/sunken/glass)،
    مراتب ظلال `--shadow-1..3`، خطوط `--line-card/soft/ornament`، أنصاف أقطار، تدرجات
    `--grad-surface/canvas`، نمط هندسي SVG `--pattern-geometry`، وكتلة `[data-theme="dark"]`
    كاملة تعيد تعريف الرموز العامة.
  - `main.tsx`: `installAppearance()` + استيراد `premium-theme.css` أخيرًا (طبقة تطغى).
- [x] **P2 الخلفيات والزخرفة**: خلفية عاجية متدرجة بطبقات radial (فاتح/داكن)، شبشة نجمة
  ثمانية SVG خافتة عبر `body::before` بقناع متلاشٍ (تخفيف خلف المحتوى الطويل)،
  شريط علوي متدرج بلون القسم، أقواس hero.
- [x] **P3 بطاقات/أزرار/حقول/إشعارات**: `.panel` بسطح متدرج + خط جانبي بلون القسم
  (`::before`) + زاوية زخرفية (`::after`) + تاج تحت h3؛ أزرار primary بتدرج وظل مرحلي
  وارتفاع 42؛ حالات hover/focus ملوّنة؛ `.section-rule`؛ toast + mobile-nav زجاجية؛
  RTL بخصائص منطقية.
- [x] **P4 داكن كامل**: تغطية الأسطح الصلبة القديمة بقواعد `[data-theme="dark"]`
  (home cards، day header/view-switch، hint، prayer، station، arch، auth-loading،
  journey-library، curriculum archive، resource editor) + إعادة تعريف متغيرات
  `.learning-journey` و`.quran-journey` للداكن + مزامنة ثيمة قارئ القرآن مع المظهر
  العام (`initialReadingTheme` في `quran/learning.ts` — مضمّنة محليًا لأن الاختبارات
  تترجم الملف وحده عبر data:URL).
- [x] **P5 تحقق + توثيق**: انظر §6.

## 5. المقبولة (Acceptance)

- [x] 7 أقسام تُعيد ملوّنتها خصيصًا قابلة للإدراك عبر الرموز (الشريط النشط، الأزرار، حواف اللوحات).
- [x] Dark mode ممتلئ: 6 صفحات رئيسية = صفر أسطح فاتحة مشتبهة (فحص DOM مكاني)،
  تباين ≥6.6 داكن و≥4.56 نهاري (قياس في المتصفح).
- [x] لا مواضع بيضاء متساوية؛ لا أخضر مصري؛ بلا زخرفة خلف نص.
- [x] لا انكشاق وظيفي: 206/206 اختبارًا (3 جديدة لـappearance) + tsc نظيف + build ناجح.

## 6. سجل التنفيذ

| التاريخ | المرحلة | ما نُفّذ | نتيجة التحقق | المتبقي |
|---|---|---|---|---|
| 2026-11-03 | P0 | جرد كامل (22 ملف CSS، نظام section theme موجود ومختبر؛ فجوة الداكن مؤكدة: لا شيء يضبط data-theme) | — | P1..P5 |
| 2026-11-03 | P1-P4 | appearance.ts + AppearanceToggle + premium-theme.css + رموز brand-identity + تغطية داكن شاملة + مزامنة قارئ القرآن | tsc نظيف؛ 206/206؛ build ناجح (PWA 57)؛ فحص متصفح: صفر فواتح في الداكن عبر الرئيسية/يومي/القرآن/السير/حاسب/الإعدادات؛ تباين مقيس: داكن 6.6–15.25، نهاري 4.56–10.5؛ مفتاح المظهر والسبانكت يعملان | — |
| 2026-11-03 | P5 | فحص مباشر للفاتح/الداكن/تلقائي + مركز الإشعارات + استعادة التفضيل إلى system | مكتمل | — |

### ملاحظات وحدود معروفة

- فحص mobile/tablet عبر CSS media queries موجودة مسبقًا دون محاكاة عرض (لا أداة viewport
  في بيئة الفحص)؛ القواعد الجديدة تستخدم قيمًا منطقية/نسبية.
- دعم LTR: الخصائص المنطقية (`inline-start/End`) اُعتمدت في القواعد الجديدة؛ التطبيق
  الإنجليزي الكامل غير موجود في النطاق الحالي.
- ملفات domain عميقة (قارئ القرآن، محرر السير) لها أنماط داخلية مستقرة؛ عولجت أسطحها
  عبر متغيرات نطاقها وقواعد الداكن المركزية دون إعادة كتابتها.
