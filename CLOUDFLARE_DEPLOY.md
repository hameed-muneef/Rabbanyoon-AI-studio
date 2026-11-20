# Cloudflare Pages deployment

Cloudflare Pages has a 25 MiB limit per static asset. The `build:cloudflare` command removes PDF copies from `dist` and redirects 16 existing `/books/...` paths to the public Supabase Storage bucket `journey-books`. It omits `qawaid-al-suluk.pdf`, which exceeds the 50 MB Supabase Free per-file limit. The original PDFs remain in the repository until the Supabase uploads have been verified.

1. In Supabase **Storage**, open the public bucket `journey-books`. Upload the 16 PDFs in `public/books/` other than `qawaid-al-suluk.pdf`, preserving their exact filenames at the bucket root. Do not upload `book-text.json` or `manifest.json`; they remain in Pages.
2. Open each uploaded book's public URL and confirm it loads. The URL should have the shape `https://PROJECT.supabase.co/storage/v1/object/public/journey-books/FILE.pdf`. Keep the local originals until all 16 have been checked.
3. Push the Cloudflare build changes to GitHub. In Cloudflare **Workers & Pages → Create application → Pages → Import an existing Git repository**, connect `hameed-muneef/Al-masira-Al-Rabbania` and select branch `main`.
4. Set framework preset **React (Vite)**, build command `npm run build:cloudflare`, and build output directory `dist`.
5. Set these build environment variables in the Pages project: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `NODE_VERSION=22`. Use the same Supabase publishable values as Netlify. Never use a Supabase secret key in a `VITE_` variable.
6. Deploy and test the `*.pages.dev` URL from an Egyptian connection without a VPN. Check `/`, `/admin`, and several book links. `qawaid-al-suluk.pdf` is displayed as temporarily unavailable. Pages serves React routes such as `/admin` automatically because this project has no top-level `404.html`.
7. In Supabase **Authentication → URL Configuration**, set **Site URL** to the new Pages production URL and add that URL plus its `/admin` path to **Redirect URLs**. Keep the Netlify URL only if you still intend to use it.

Locally, `npm run build:cloudflare` produces the Cloudflare-ready `dist` folder using the Supabase URL in `.env.local`. The redirect build does not verify that the PDFs have already been uploaded, so complete step 2 before publishing.

`public/_headers` adds baseline browser security headers to static responses,
including anti-framing, MIME-sniffing protection, a frame-ancestors-only Content
Security Policy, a referrer policy, and a restrictive permissions policy. Verify
the response headers on the deployed Worker URL; a successful build alone does not
prove that a host applied them.

## If the dashboard created a Worker

Workers Builds shows separate **Build command** and **Deploy command** fields instead of a build output directory. Set the build command to `npm run build:cloudflare` and keep the deploy command as `npx wrangler deploy`. The repository's `wrangler.jsonc` names the live Worker `al-rabaniyoon`, points static assets at `dist`, and enables SPA routing for `/admin`. The Worker name must match the Worker whose URL you open; otherwise Wrangler can publish to a different Worker. The Cloudflare build makes book readers use their Supabase public URLs directly, because an unmatched `/books/...` navigation on a Worker can otherwise fall back to the app homepage. Save the build settings, push the configuration, and retry the deployment. The build log must include `Cloudflare Pages build ready: 16 PDF redirects to Supabase; 1 temporarily unavailable PDF omitted.` before Wrangler deploys assets. The PDFs must be uploaded to `journey-books` for the reader to display them.

## Custom domain: alrabbaniyun.com

The app builds auth redirect links from window.location.origin, so no code change is needed. In Cloudflare, attach lrabbaniyun.com (and www) as Custom Domains on the Worker. In Supabase **Authentication > URL Configuration**, set Site URL to https://alrabbaniyun.com and add https://alrabbaniyun.com/** (and the www equivalent) to Redirect URLs. Keep the Resend SMTP sender on a verified lrabbaniyun.com address. Then test sign-up confirmation and password reset from the live domain.
