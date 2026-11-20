# Cloudflare Pages Deployment — الربانيون

## Project settings

- **Build command:** `npm run build:cloudflare`
- **Build output directory:** `dist`
- **Root directory:** repository root
- **Node version:** use the project-supported Node 22+ environment
- **Production domain:** `https://alrabbaniyun.com`

## Why this command is required

`build:cloudflare` runs deployment configuration checks, builds the application, prepares PDF redirects, and verifies that all public SEO pages are present as real static HTML files. A plain old deployment can leave the live domain serving an older SPA shell; the verification step prevents the artifact itself from being incomplete.

## After deployment

Verify these URLs return their own HTML titles and headings:

- `/about/`
- `/library/`
- `/quran/`
- `/sunnah/`
- `/aqeedah/`
- `/tazkiyah/`
- `/worship/`
- `/methodology/`
- `/daily-program/`
- `/sirah/`
- `/daily/`
- `/accountability/`
- `/strong-muslim/`
- `/learning-paths/`
- `/robots.txt`
- `/sitemap.xml`

Then purge Cloudflare cache if an older HTML shell remains, and submit `https://alrabbaniyun.com/sitemap.xml` in Google Search Console.
