# خطة الهوية البصرية الكاملة (Complete Platform Color Identity) — تنفيذ

> آخر تحديث: 2026-11-03. التوجه: **أزرق + أخضر غابي + تيل + زيتوني + مريمية + ذهب عتيق**،
> الأزرق جزء **بارز وذو معنى** من الهوية (ليس تزيينًا).

## 1. الألوان (Tokens مركزية)

### A. الأزرق — جزء أساسي من الهوية
| Token | Value |
|---|---|
| `--color-blue-deep` | `#1B2C2D` |
| `--color-blue-dusty` | `#527F8B` |
| `--color-blue-sky` | `#729EAA` |
| `--color-blue-soft` | `#9BBEC5` |
| `--color-blue-powder` | `#C1D9DC` |
| `--color-blue-light` | `#DFE9E8` |

### B. الأخضر/التيل
`#1D3E3C` · `#294039` · `#31443D` · `#164F59` · `#477A70`

### C. الزيتوني/المريمية
`#283025` · `#32412F` · `#273930` · `#A8B9A0` · `#D5DFD1`

### D. الذهبي/المحايدة
`#B99A5D` · `#615A41` · `#F3F0E7` · `#D8D0BB` · `#172921`

### E. هويات الأقسام (مُحدَّثة)
| القسم | Accent | Soft |
|---|---|---|
| قرآن | `#174C3C` + `#9BBEC5` | Emerald + Soft Blue |
| سير | `#527F8B` + `#164F59` | Dusty Blue + Deep Teal |
| يومي | `#32412F` + `#B99A5D` | Olive + Muted Gold |
| زكّ | `#A8B9A0` + `#294039` | Sage + Forest Green |
| حاسب | `#729EAA` + `#876D83` | Muted Blue + Soft Plum |
| أسبوعي/شهري | `#477A70` + `#C1D9DC` | Teal + Powder Blue |
| مؤمن قوي | `#344C83` + `#D5DFD1` | Slate Blue + Sage |

## 2. خطة التنفيذ

- [x] P0: جرد (هذه الوثيقة §1)
- [x] P1: tokens مركزية (brand-identity.css + section-theme.ts) — blue + forest + teal + olive + sage + gold
- [x] P2: primary/ink/body/border/focus → blue-teal (نهاري) + navy (داكن)
- [x] P3: surfaces/cards/sidebar/header harmonization
- [x] P4: decorative accents (gold lines, turquoise icons)
- [x] P5: dark mode harmonization
- [x] P6: verification (contrast scan + responsive + tests + build)

## 3. سجل
| التاريخ | المرحلة | النتائج |
|---|---|---|
| 2026-11-03 | P0 | جرد + خطة (this doc) |
