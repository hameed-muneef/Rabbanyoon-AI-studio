# SEO Implementation Plan — الربانيون

## 1. Initial Audit Summary
- Frontend: React + Vite SPA (client-side rendering).
- Backend: Supabase (auth, RLS, RPCs).
- Hosting: static build (Cloudflare Pages compatible).
- Existing SEO: basic meta description/title, robots.txt (minimal), no sitemap, no structured data, no OG/Twitter.
- Public surface: authentication screen + app (mostly authenticated). Private data protected by auth.

## 2. Architecture
- SPA, no SSR/SSG currently. Google can render JS, but public content is limited.
- Important: private pages must remain noindex and auth-protected.

## 3. Implemented Now (Foundation)
- [x] Unique SEO title and meta description in index.html.
- [x] Open Graph + Twitter Card metadata.
- [x] Canonical link (relative /).
- [x] JSON-LD Organization + WebSite.
- [x] lang="ar" dir="rtl".
- [x] robots.txt with sitemap reference and private route disallows.
- [x] sitemap.xml (homepage only; expand with public content URLs).
- [x] SEO plan document.

## 4. Pending / Roadmap
- [ ] Public content hub (مكتبة الربانيون) with indexable articles.
- [ ] Dynamic metadata per public route (react-helmet or SSR).
- [ ] Server-side rendering / prerendering for public pages.
- [ ] Arabic keyword research and topic clusters.
- [ ] Structured data for articles/courses/breadcrumbs.
- [ ] hreflang for future languages.
- [ ] Google Search Console verification & sitemap submission.
- [x] Cloudflare output validation: `npm run build:cloudflare` verifies public page HTML, canonical/robots/JSON-LD, and sitemap before deployment.
- [ ] Core Web Vitals optimization and monitoring.
- [ ] SEO admin capabilities.

## 5. Security / Privacy
- Private routes (admin, settings, progress, notifications) disallowed in robots.txt and protected by auth.
- No private data exposed in sitemap or metadata.

## 6. Next 90 Days
- Phase A: Technical SEO foundation (done baseline).
- Phase B: Public landing pages + content hub.
- Phase C: Islamic educational content publishing.
- Phase D: Search Console + analytics.
- Phase E: Authority & organic growth.
- Phase F: Continuous optimization.
## Phase 2 Platform-Only Progress

- Added public crawlable pages: about, library, quran, sunnah, tazkiyah, worship, aqeedah, methodology, daily-program, sirah, daily, accountability, strong-muslim, learning-paths.
- Each page has unique title, description, canonical, OG/Twitter, JSON-LD, internal links.
- Sitemap updated (15 URLs).
- AuthScreen includes SEO content section.
- hreflang (ar) + og:url added to index.html.
- Remaining: prerender/SSR, deeper content, CWV, GSC verification, GA4.
