# Production Readiness Audit

**Audit date:** 2026-10-31
**Status:** **NOT READY FOR PRODUCTION**

This is an evidence-based audit of the repository and a read-only inspection of
the connected Supabase database. It is not a penetration test, a restore drill, or
a full browser acceptance test. Existing worktree changes were preserved; no
unverified code, data, or storage objects were deleted.

## System inventory

- **Client:** React 19, TypeScript, Vite 6, PWA service worker; 89 source files
  across the app and view modules.
- **Backend:** Supabase Auth, Postgres/PostgREST RPCs, RLS, and Supabase Storage.
  There is no separate application API server in this repository.
- **Deploy targets:** Netlify and Cloudflare Workers static assets, with
  `npm run deploy:check` validating local public Supabase configuration.
- **Authentication:** Supabase email/password. Administrative access is checked
  separately; platform login does not authenticate a user with Google.
- **External services:** Supabase Auth, database, and storage; Google Meet is
  opened manually through `meet.new` and its URL is pasted into a form. No Google
  OAuth/calendar API or payment provider is integrated.
- **Database:** 48 local SQL migrations. The current UI still uses the
  owner-scoped `user_data` JSON payload for much of the personal planner state;
  relational migrations support the community, courses, and other features.
- **Automation:** No `.github/workflows` CI configuration was found. No
  `pg_cron` extension or scheduled database job was found in the connected
  database.

## Findings and priority

| Priority | Finding | Evidence / impact | Recommended action |
|---|---|---|---|
| **Resolved P1** | Study-question feature was not deployed to production | Before the follow-up, `202610310011_study_questions.sql` was pending and a live PostgREST request returned `PGRST202`. The owner approved the migration; only this migration was applied transactionally. The ledger now records checksum `2baa01e00171e1748193d868605c60b6ead2ef51c45a6a236fe7eb0797f37a31`; both tables have RLS and no direct anon/authenticated table privileges, and all six RPCs have fixed `search_path` and authenticated-only execution. PostgREST schema reload was requested. | After deploying the matching client, verify the question/reply/review flow with member and approved-teacher accounts. |
| **P1** | Backup and recovery readiness is unverified | No backup restoration test or verified recovery procedure was available in the repository or this environment. A backup should not be considered reliable without a restore test. | Verify provider backup/retention and perform a restore drill in a separate safe environment before further production schema work. |
| **P1** | Production user journeys have not been accepted end-to-end | No shared browser session or test accounts for member, teacher, and admin roles were available. Builds and database tests cannot verify deployed authentication, redirects, RLS behavior through the UI, or mobile layout. | Run the documented deployed-site acceptance flows with test accounts on desktop and mobile. |
| **P2** | Development/build dependency advisories | `npm audit --omit=dev` reports **0** vulnerabilities. Full `npm audit` reports **10** in build/test dependencies (2 low, 8 moderate), including `deepmerge`, `glob`, and `minimatch` in the PWA/Workbox toolchain. npm only offered an automatic fix with a forced, breaking downgrade of `vite-plugin-pwa`; no dependency downgrade was made. | Review safe upstream upgrades or compatible overrides, then rerun the production build and PWA checks. |
| **P2** | Initial JavaScript chunk exceeds Vite's warning threshold | Production output reports a 594.91 kB main JavaScript chunk (168.15 kB gzip), above Vite's 500 kB warning threshold. Route-level chunks are already split. | Set a measurable initial-load budget and profile on representative mobile networks before further splitting. |
| **P2** | No automated browser/E2E or CI gate was found | There are 41 Node test files, but no browser test runner, `.github/workflows`, or repository CI configuration. | Add a CI gate and focused browser tests for auth, permissions, primary journeys, and responsive layouts. |
| **P2** | Live response headers and security controls are not provider-verified | Repository configs previously had no baseline response headers. This audit added anti-framing, MIME-sniffing, referrer, permissions, and frame-ancestors headers for both configured hosts; builds confirm the config is present, not that the live host serves it. Provider rate limits, auth policies, and production redirects also remain unverified. | Verify deployed response headers and Supabase Auth/rate-limit settings from the actual deployment. |
| **P2** | Monitoring and operational recovery are not verified | No application error-monitoring or uptime configuration was found in the repository. No production incident/rollback drill was available. | Configure and test lightweight error/uptime monitoring and document who responds to failures. |
| **P3** | Public metadata is minimal | The page has an Arabic title, description, icon, and `robots.txt`; no Open Graph tags, canonical URL, or sitemap were found. Much of the app is authenticated and is not a public content site. | Add public sharing metadata only if public landing pages are intended. |

## Verified controls and results

- **Production migration ledger:** All local migrations through
  `202610310011_study_questions.sql` are applied with matching checksums; no
  pending local migration, checksum mismatch, or remote-only ledger entry was
  found after the approved migration.
- **Live API checks:** The configured Supabase Auth settings endpoint returned
  HTTP 200: signup is enabled and email auto-confirm is disabled. A request to
  `list_study_questions` returned `PGRST202` before the migration was applied.
  After applying it, the migration transaction requested a PostgREST schema
  reload. No authenticated browser session was available to exercise the RPC
  through the production API.
- **Database access:** No public table was found with RLS disabled. Twelve
  RLS-enabled tables have no policies; inspection found no direct `anon` or
  `authenticated` table grants for them, consistent with RPC-only access.
- **Privileged functions:** Inspected 130 public `SECURITY DEFINER` functions;
  none lacked a fixed `search_path`.
- **Book storage:** The public `journey-books` bucket exists and contains 17
  objects. No objects were deleted. The UUID-named PDF format is supported by
  the current admin upload flow.
- **Secrets/config:** `.env.local`, `.env.*.local`, and `.env.db.local` are
  ignored by Git.
  Deployment configuration uses a publishable browser key and the local
  `npm run deploy:check` passed. No secret values were copied into this report.
- **Response-header remediation:** Added headers for Netlify and Cloudflare
  static responses in `netlify.toml` and `public/_headers`, with a regression
  test in `tests/security-headers.test.mjs`. The Cloudflare build output contains
  the header file.
- **Regression tests:** `npm test` — **99/99 passed**.
- **Builds:** `npm run build` and `npm run build:cloudflare` succeeded.
  Cloudflare output reported 16 PDF redirects and one intentionally omitted
  oversized PDF. Vite still reports the main-chunk warning above.
- **Deployment config:** `npm run deploy:check` passed locally. This does not
  prove that hosted environment variables match the local configuration.
- **CI:** GitHub reports zero Actions workflows and zero workflow runs for the
  repository.

## Areas not fully verified

- No visual browser review, screen-reader/keyboard audit, or mobile viewport
  acceptance was possible in the current session.
- No authenticated live account was used to exercise registration, password
  reset, admin workflows, or member/teacher permissions.
- No restore test, load test, live uptime check, rate-limit test, or external
  Google Meet account workflow was performed.
- `npm audit` covers known dependency advisories; it is not a substitute for
  source-level penetration testing. No destructive tests were run.
- No code, database table, row, storage object, or dependency was removed.
  Potential cleanup was deferred unless safe removal could be proven.

## Approval required / next steps

1. Deploy the matching client and run question/reply/review flows with member and
   approved-teacher accounts.
2. Verify backups and restoration in a safe environment before additional
   production schema changes.
3. After deployment, verify account-role and mobile end-to-end flows and live
   security headers.
4. Resolve or formally accept the build-tool dependency advisories and initial
   bundle-size warning against agreed launch criteria.

No P0 issue was confirmed by the checks run. The migration gap is resolved, but
backup/recovery and end-to-end production verification remain P1 blockers, so the
platform cannot yet be declared ready for launch.
