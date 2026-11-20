# Netlify deployment

## 1. Prepare Supabase

Apply the database migrations described in [DATABASE.md](DATABASE.md). The deployment needs `public.user_data`, `public.platform_curriculum`, `public.admin_accounts`, the `public.is_admin()` function, and the `journey-books` Storage bucket with its policies. Set `INITIAL_ADMIN_EMAIL` when running `npm run db:migrate` to approve the first administrator. That email must have a confirmed Supabase Auth account before it can open `/admin`. Database credentials belong on the operator's machine, never in Netlify's `VITE_` variables.

In Supabase **Authentication → URL Configuration**, set **Site URL** to the final Netlify URL (or custom domain). Add the same URL and `https://YOUR-SITE.netlify.app/admin` to **Redirect URLs**. Add local `http://localhost:5173/**` only for development. Confirm that email sign-up and confirmation are enabled. The app sends confirmation links back to the page where registration started.

## 2. Connect Netlify

Connect the GitHub repository to Netlify. [netlify.toml](netlify.toml) specifies Node 22, `npm run deploy:check && npm run build`, `dist` as the publish directory, and a rewrite so refreshing `/admin` loads the app.

The Netlify configuration also sets baseline response headers: `X-Frame-Options`,
`X-Content-Type-Options`, a frame-ancestors-only Content Security Policy,
`Referrer-Policy`, and a restrictive `Permissions-Policy`. Verify these on the
deployed URL; local builds cannot confirm host-applied headers.

Use the Git-connected build rather than Netlify's drag-and-drop uploader: the bundled book PDFs make the publish folder roughly 268 MB. The PDFs are fetched when opened and are not pre-cached by the PWA, but they still count toward deployment size and bandwidth.

Set these **environment variables** in Netlify for the production deploy:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL, for example `https://PROJECT.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_...`) or legacy anon key |

Do not put a Supabase secret/service-role key in either `VITE_` variable. Vite embeds these values in public JavaScript. The deployment check fails if required values are missing or if a `sb_secret_` key is used.

## 3. Verify the deployed site

1. Open `/` in a private browser session. Register a normal account, confirm its email, sign in, create a plan item, reload, and check that it persists.
2. Open `/admin` directly and refresh that URL. A normal account must be denied; the approved and confirmed admin account must reach the editor.
3. As admin, change a harmless curriculum item and check that the save status says it is saved. Open **واجهة المستخدم** to inspect the normal view; use **لوحة الإدارة** in its top bar to return.
4. Check that a newly uploaded PDF opens, and that an ordinary user cannot upload or edit the shared curriculum.

The normal and admin views use the same Supabase login session. The view switch changes the page, not the account or its database permissions. The no-account demo stores data only in the current browser and is separate from cloud persistence.

## Local checks

Run `npm test`, `npm run deploy:check`, and `npm run build`. A successful local build verifies code and local configuration; the live account, admin membership, Netlify variables, and deployed login flow still require the checks above.
