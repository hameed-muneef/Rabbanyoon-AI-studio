# خطة التكامل (Islamic Geometric Global Theme) — تنفيذ

> آخر تحديث: 2026-11-03.

## 1. الأصل (Asset)

- **الأصول:** `public/backgrounds/zakhareph-bg.jpg` (1200×1529، 631 KB) و `zakhareph-hero.jpg` (2000×1125، 689 KB) — مشتقات web من الصورة الأصلية (التي أُزيلت بعد التحسين).

## 2. نظام الألوان المركزي (مستوحى من الصورة)

| Token | Value | Usage |
|---|---|---|
| `--art-turquoise` | `#55B8C5` | Accents, highlights, selected states |
| `--art-turquoise-light` | `#A4D5D4` | Soft highlights, hover surfaces |
| `--art-deep-teal` | `#164F59` | Structural accents, sidebar, borders |
| `--art-navy` | `#172C45` | Sidebar, header, deep structural |
| `--art-royal-blue` | `#344C83` | Section accents, links, progress |
| `--art-gold` | `#C5A45F` | Decorative details, icons, lines |
| `--art-ivory` | `#F2EBD9` | Light surfaces, text on dark |
| `--art-stone` | `#D8D0BB` | Soft surfaces, secondary text |

**الهرمية:** navy/deep-teal للهيكل، turquoise للتمييز، gold للزخرفة، ivory للقراءة.

## 3. طبقات الخلفية

- `body::before` (z-index -2): artwork كاملاً (cover, center) بشفافية 0.06 (فاتح) / 0.14 (داكن) + قناع تلاشي عمودي.
- `body::after`: pattern هندسي خفيف (موجود) — يبقى.
- `.hero`: artwork hero crop + overlay تدرّجي forest→warm (نص readable).
- Sidebar: deep navy/teal gradient + gold خط أيسر.
- Header: glass navy surface.
- Cards: solid surfaces (ivory/espresso) — artwork غير مرئي خلفها (readability).
- Dialogs/dropdowns: solid readable surfaces.

## 4. التكامل مع الألوان (harmonize, don't replace)

- `--color-primary` في فاتح: `#174F59` (deep teal) بدل forest green?? — **لا**: forest green #174C3C يبقى هوية المنصة (brand). الألوان الجديدة = accents (turquoise/gold/navy) تُضاف بدل الألوان الحالية.
- Dark mode: surfaces warmed from espresso to a teal-navy blend? Keep espresso but add turquoise/gold accents.
- Section identities (7 ألوان) تبقى — harmonized by adding turquoise/gold borders.

## 5. مراحل

- [x] P0: جرد + أصول (هذه الوثيقة §1).
- [ ] P1: رموز الألوان (centralized tokens) + global background layers.
- [ ] P2: Sidebar/header harmonization (navy + gold).
- [ ] P3: Cards (deep teal accents, gold lines).
- [ ] P4: Hero artwork integration.
- [ ] P5: Dark mode harmonization.
- [ ] P6: Verification (tsc/tests/build + browser measurements).

## 6. سجل

| التاريخ | المرحلة | النتائج |
|---|---|---|
| 2026-11-03 | P0 | جرد + أصول (zakhareph 2400×3058، مشتقات 2) |
| 2026-11-03 | P1-P4 | **رموز centralized** (8 tokens turquoise/deep-teal/navy/royal-blue/gold/ivory/stone + art-bg/hero)، **طبقة خلفية عامة** (body::after opacity .07/.14 + mask)، **hero** (artwork + gradient 115deg + gold border)، **sidebar** deep navy + gold accents (contrast ≥5.02)، **header** glass navy + gold border، **cards** gold side-line + teal accent + inset gold ring، **progress** turquoise→deep-teal، **icon containers** turquoise tint، **focus** gold، **dialogs** gold border. `tsc` نظيف، 206/206 اختبار، build ناجح (PWA 56) |

### حدود

- لا أُعدّل الأصل.
- قراءة مريحة: artwork خلفية (شفافية منخفضة) + surfaces صلبة.