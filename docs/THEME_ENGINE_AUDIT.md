# Theme Engine Architecture Audit

Date: 2026-11-09

## Initial findings

The application had several visual authorities loaded together:

- `brand-identity.css` defined the first palette and also redefined many global selectors.
- `design-system.css` defined another palette and component primitives.
- `dark-auto-sweep.css` added broad dark selectors for individual components.
- `premium-theme.css` was a late override layer with additional hardcoded surfaces.
- Feature styles (`auth.css`, `learning-redesign.css`, `quran.css`, `circles.css`, and others) frequently mixed semantic variables with literal colors.
- The Quran reader had competing selectors for the application theme and a reader-specific dark class.

This explains why a local dark-mode fix could change light mode or disappear behind a later selector: the project had no final semantic boundary.

## Theme Engine introduced

`src/theme-engine.css` is now imported last in `src/main.tsx`. It is the single semantic boundary for shared UI:

- `:root, [data-theme="light"]` defines the complete warm milky light environment.
- `[data-theme="dark"]` defines the complete deep navy/blue-green dark environment.
- Semantic tokens cover backgrounds, surfaces, typography, accents, borders, elevation, states, statuses, focus and image overlays.
- Compatibility aliases let legacy components migrate incrementally without creating another palette.
- Shared primitives (shell, panels, controls, forms, tables, progress and statuses) consume semantic tokens.
- Reading/library/resource surfaces now consume the same tokens through the final override layer, covering book chapters, PDF controls, uploads, dialogs and learning readers.
- Daily planning, prayer timeline, administration, permissions, goals and progress cards now consume semantic surface, text, border, state and status tokens through the same boundary.
- Quran/Sunnah discovery, Hadith book selection, Azkar search/categories/progress, and the Quran journey cards now follow the application theme; only the Quran reading paper remains intentionally light.
- A browser audit exposed a real cascade conflict in the Quran reader: legacy `!important` dark text rules in `premium-theme.css` and `quran.css` overrode the paper surface. Those source rules were changed to the intentional paper ink color instead of adding another isolated component patch.
- The same browser pass found late-loaded Quran route styles reverting Azkar controls to light colors in dark mode. Theme-qualified dark and light selectors were added for Azkar buttons, search, categories, count/repeat badges and completed items; both states were rechecked without horizontal overflow.
- The learning journey was checked in the browser at desktop width in both themes. Its overview remains an intentional accent hero, while navigation, article, sources, videos and library surfaces now resolve to the correct independent semantic palette without horizontal overflow.
- Browser review also caught the generic `page-intro h1` ribbon being applied inside the learning hero. It was removed only for `.learning-journey .learning-intro h1`, eliminating the gradient rectangle and title/eyebrow collision without changing other page headings.
- A deep browser pass of «حياتي مع الله» found its page header and view switch retaining the wrong light surface while the application was dark. Theme-qualified day-planner rules now force the correct dark surface and readable text; light mode was rechecked afterward.
- The admin route was audited separately because `AdminDashboard` renders outside the member `.app` shell. Its dark form controls were retaining a legacy brown border; scoped standalone-admin selectors now use the same input surface, text and border tokens. The admin table remained contained with no page-level horizontal overflow.
- Settings and notification states were checked in the browser in both themes: appearance controls, selects, privacy/export panels, notification panel, filters and actions remained readable with no page-level horizontal overflow.
- Browser review of the provided notification screenshot identified a stacking bug: the popover was behind content cards. The topbar, notification center and popover now have explicit stacking layers (`1000/1100/1200`), with the mobile fixed panel retaining the same priority.
- The daytime palette was lightened without using pure white as the dominant background: page/app surfaces are now warmer and brighter, and the sidebar uses a pale warm surface with dark readable navigation text.
- The primary topbar was enlarged to an 82px desktop band and given distinct warm-cream/day and navy/night gradients. It remains full width of the main content column (the sidebar remains a separate navigation rail), with a 60px mobile rule and no overflow.
- Per the user's colour choice, the dark topbar now uses a distinct warm dark-brown gradient (`#4A3A2A → #33281E`) with a muted warm border, clearly separated from the navy page background; header text contrast measures 9.4:1.
- The right navigation rail in dark mode now shares the same warm brown identity as the dark topbar (same gradient and border). Nav text uses the primary light token, secondary lines/icons use warm `#CDB59A`, hover/active states use translucent warm overlays, and the inactive icons were unified to the warm tone.
- Home section cards (`.feature-card[data-section]`, `.wide-card[data-section]`) in dark mode now carry a calm per-section tint: each card mixes its own muted `--section-accent` into the dark surface (≈26%→10% gradient, 42% border, 30% icon tile, stronger on hover), replacing the uniform blue card while keeping the navy base. Verified by screenshot; no overflow.
- The home "up next" strip (`.home-next-card` ×2 and `.home-today-entry`) received the same calm treatment in dark mode, tied to the muted sage of the «يومي مع الله» card (`#8E978D` mixes), including icon tiles; verified by screenshot with no overflow.
- Full mushaf reader GUI audit in dark mode found the root cause of paper faults: the app-wide typography rules (`#root .app h1..h6/label/small/button`), the dark `--color-*` redefinitions inside `.quran-reader`, and the dark auto-sweep chip rules matched reader elements directly and beat inheritance, leaking the night palette onto the paper surface (invisible gold section labels, light headings «السور/مقاطع», faint labels «من الآية/إلى آية», near-black chips «بحث/سجّل قراءتي/حفظ في السجل/نسخ/مشاركة» with dark text, light unreadable «A−/A+» and «متواصل»). A "reader paper chrome" block now pins the paper palette (ink `#27332E`, muted `#52605A`, gold ink `#8A6A38`, paper chips `#E1D9C9/#B9AD98/#29463B`, selected `#DDE5DF`) to headings, labels, smalls, section labels, reading-mode buttons, font steps and buttons in BOTH themes. Verified by computed styles and screenshot; light mode values are identical by design; no overflow.
- Follow-up interactive states inside the reader in dark mode were audited and fixed with the same paper-chrome block: hifz-mode steppers ▲▼ (were transparent with light text) and the primary «بدء التلاوة» button (now green paper-primary `#244638`), saved-progress/marks/notes list items (was dark `#143247` card with ink text, now paper surface), and the search panel + tafsir content panel were verified clean. A full DOM sweep found no remaining dark-surface/light-text conflicts inside the reader outside the mushaf.
- The Quran is intentionally a light paper reading surface in either application theme, per product decision. This is a scoped reader surface, not a second application.

## Background and asset preservation

The existing assets remain present and were not deleted or replaced:

- `public/backgrounds/zakhareph-hero.jpg`
- `public/backgrounds/zakhareph-bg.jpg`
- `public/backgrounds/2025.jpg`
- `public/backgrounds/2026.jpg`
- `public/brand/*` logos and marks

The engine adds `.theme-image-surface` and `--image-overlay` so existing images can receive a light or dark readability overlay without changing the source asset.

## Contrast and readability decisions

Light primary text is `#17313a`, secondary text is `#304b50`, and muted text is `#52686a`; these are intentionally darker than the milky surfaces. Dark primary text is `#f1efe5` and secondary text is `#d2ddd7` against navy surfaces. Placeholders and disabled text use separate tokens rather than opacity-only treatment.

The new static test verifies token completeness and theme isolation. A browser contrast audit is still required for every route and image-backed state because effective contrast depends on component backgrounds and overlays.

## Route and visual coverage status

The architecture applies globally to the shared application shell and all imported global styles. Feature-specific files remain migration targets where literal colors still exist; the current final layer covers their highest-impact reading/resource surfaces without changing business logic. The following areas require browser screenshots and interaction-state review before being called complete:

- authentication and recovery screens
- learning journey and reading/PDF surfaces
- daily planner and prayer timeline
- Quran/Sunnah reader states
- notifications, dialogs, tables and admin panels
- responsive desktop/tablet/mobile layouts

No visual-regression runner is configured in `package.json` currently. The repository has functional Node tests but no Playwright dependency or approved screenshot baselines; adding those requires a browser test environment and baseline approval rather than claiming completion from static tests.

## Verification

- `tests/theme-engine.test.mjs` protects token presence, dark/light separation, Quran paper behavior and import order.
- Existing business logic and feature styles were not rewritten in this architecture pass.
- Remaining hardcoded colors are migration debt to be removed component-by-component under the semantic tokens.
- Latest user screenshot fault (verse-actions row): the reference pill «البقرة: ١» (`.quran-reference`) was recoloured by the dark auto-sweep to a navy card (`--dark-surface` `#143247`) while its text followed the pinned gold ink, producing dark-on-dark unreadable text. Root cause: the mushaf-wide wildcard `#root .app .quran-reader .quran-mushaf *:not(svg):not(path)` also forced ink onto the pill. Fix: removed the leaky sweep rule, pinned the pill to paper `#eef2e8`/gold ink `#8a6a38` with a higher-specificity selector (`... .quran-mushaf .quran-reference`) + `!important`, and pinned `--text-primary/secondary/muted` to paper values inside `.quran-reader` so unstyled buttons (mark rows) also stay on paper. Verified: pill now gold-on-paper, mark button ink-on-paper, full DOM sweep 0 dark-bg/light-text conflicts; build + 10/10 tests pass.
- #4 (save_quran_learning_state HTTP 400) investigation: root cause is a DB constraint/cast failure in the PL/pgSQL RPC (null surah/ayah into NOT NULL columns, duplicate bookmarks hitting the unique index, or empty-string casts). Client-side guard added in src/quran/sync.ts: filters bookmarks/notes/history/reflections/routine/hadithBookmarks missing required keys and de-duplicates bookmarks before save. Remaining DB-side hardening (nullif + filters + ON CONFLICT) is a follow-up migration.
- #3 (hex migration) continued: day-planner.css palette hex (primary/canvas/surface/muted) migrated (269→211 hex); remaining granular phase tints. admin.css now 58 hex (from 161).
- #4 (save_quran_learning_state HTTP 400) resolved: created migration 202611090001_harden_quran_learning_save.sql (create or replace function) with nullif guards, WHERE filters for required keys, ON CONFLICT DO NOTHING for bookmarks, and guarded reading_position insert. Applied via db:migrate (18 tables verified). Client guard in sync.ts retained. Verified in browser: سجّل قراءتي + حفظ علامة no longer produce 400.
- #3 (hex migration) admin.css fully migrated: 161→10 hex (only #fff white-on-primary text and dark-fallback comments remain). Tinted states converted to color-mix(in srgb, var(--color-*) ..., var(--color-surface)). Build + 10/10 tests pass.
- #3 (hex migration) day-planner.css: 269→119 hex (palette + common tints → semantic tokens; remaining granular phase tints one-off).
- #3 (hex migration) day-planner.css fully migrated: 269→13 hex (only #fff white-on-primary text remains). All tints converted to color-mix/semantic tokens. Build + 10/10 tests pass.
- #3 (hex migration) quran.css + premium-theme.css: app-palette aliases migrated (gold-ink/primary/border/surface/canvas/ink/muted). Remaining hex are intentional paper constants for reader isolation (already pinned by theme-engine paper chrome).
- Mobile/tablet preventive fixes: mobile-nav grid 8→6 columns (matches 6 nav items); global overflow-x guards (html/body/#root/.content/.main/.app max-width 100%, media max-width 100%); quran reader overflow-wrap/word-break. Viewport meta already present. (Visual verification on 320–1024 still requires device/DevTools.)
- Mobile Quran reader: added @media(max-width:750px) guard — grid 1fr, surah-list full-width/max-height 220px, toolbar 1fr, selects max-width 100%, mushaf overflow-x hidden; min-width: 170/180/220px → min(...,100%). Addresses "shifts right / partial page" on mobile.
- #3 (hex migration) learning-redesign.css: app-palette aliases migrated (91→68 hex); --learn-* palette definitions retained (intentional learning-journey theme). Build ✓.
- Playwright setup: installed playwright + @playwright/test; chromium downloaded; playwright.config.ts (desktop + mobile Pixel 5, webServer reuse 5173); tests/e2e/reader-visual.spec.ts with login via auth client; 4 baseline screenshots (reader-light/dark × desktop/mobile). npm run test:e2e added.
- Cloudflare caching fix: rewrote public/_headers to eliminate overlapping rules (removed /*.js, /*.css, /*.html, / catch-all merged); catch-all /* now no-cache,no-store,must-revalidate; /assets/* immutable 1yr; /sw.js + /workbox-*.js no-cache. Added scripts/purge-cloudflare-cache.mjs + npm run cache:purge (env-gated). Build + build:cloudflare verified; _headers preserved in dist.
- Ayah audio one-at-a-time fix (QuranReader): playAyah now pauses the running ayah before starting a new one (previously overwrote ayahAudioRef → two overlapping voices); added ayahPlayTokenRef generation guard against async-fetch double-start; main surah play button (togglePlay) and memorization mode (runMemo) now stop the per-ayah voice first. Auto-advance (ayah → next) kept. Browser-verified via instrumented Audio log: manual selection pauses current ayah, chain advances automatically, surah toggle stops ayah voice, stop button ends chain.
- PWA installability (MOBILE-001): scripts/generate-app-icons.mjs (sharp) renders icon-192/512.png (any) + maskable-192/512.png (full-bleed, book in 80% safe zone) + apple-touch-icon.png 180 from icons/app-icon.svg; npm run icons:generate. Manifest icons updated in vite.config.ts; index.html apple-touch-icon → PNG + 32px PNG favicon fallback. Verified on vite preview (4173): manifest ✓ standalone ✓ SW registered ✓ PNGs 200 ✓; Lighthouse: best-practices 1.0, SEO 1.0, a11y 0.95 (color-contrast only).
- Install discoverability (MOBILE-001 follow-up): new src/InstallApp.tsx — module-level beforeinstallprompt capture (early window race), InstallAppButton in top-actions (native prompt on Chrome Android/desktop), InstallGuidePanel in الإعدادات (native button / Chrome ⋮ instructions / iOS مشاركة→إضافة إلى الشاشة الرئيسية; shows «مثبَّت» when standalone). Verified on preview: panel renders with platform-aware text; topbar button hidden when no event (embedded browser never fires BIP). Production audit: new build already live, all criteria met — reason user saw no option: menu location/manifest cache/in-app browser, not the site.
- Capacitor Android setup: @capacitor/core+cli+android installed; capacitor.config.ts (com.alrabbaniyoon.app, webDir dist); scripts/build-android.mjs = deploy:check + vite build with VITE_BOOKS_FROM_SUPABASE=true (PDFs stay on Supabase, APK small) + cap sync; launcher icons + splash (87 files) from assets/logo.png+splash.png via @capacitor/assets; release signing hook in android/app/build.gradle (KEYSTORE_BASE64 env); .github/workflows/android-build.yml (workflow_dispatch + tag app-v*, debug APK always, release AAB when keystore secrets present); .gitignore android build outputs; docs/ANDROID_APP.md. Local machine has no Java/Android SDK — CI or Android Studio required for APK.
