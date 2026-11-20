# System Audit Report

**Audit date:** 2026-11-01  
**Status:** In progress — this report is not production-readiness approval.

## Scope and method

This pass reviewed the repository architecture and existing audit documentation, ran the complete automated test suite, the TypeScript/production build, the database migration dry run, and the deployment configuration check. It also exercised the local landing and `/admin` routes in a browser, then used a user-provided authenticated admin browser session for read-only inspection of the archive panel and reviewed its PGlite authorization tests.

No live database writes, production content changes, real payment attempts, or secret values were used. This is not a full end-to-end acceptance run, penetration test, load test, recovery drill, or certification of the deployed environment.

## Architecture inventory

- **Client:** React 19, TypeScript, Vite, Arabic RTL UI, and PWA service worker.
- **Authentication and data:** Supabase Auth, Postgres/PostgREST RPCs, row-level security, and Supabase Storage. Personal planner state still includes a user-owned JSON payload; relational migrations support the newer domain features.
- **Server-side operations:** No general-purpose application API server is present. Database RPCs enforce sensitive business rules; a Supabase Edge Function exists for payment webhooks.
- **Features represented in source/tests:** personal planning, goals and tracking, learning journey, reading progress, adhkar, reflections, reports, groups/circles, courses and sessions, study tracks, invitations/notifications, mentorship, sharing, admin management, resource management, and payment readiness scaffolding.
- **Payments:** A production-verified provider flow is not established. Provider-specific Sandbox verification, merchant approval, and live activation remain outstanding.
- **Deployment:** Vite builds for the configured static deployment targets; `npm run deploy:check` validates local browser-safe Supabase settings.
- **Automated tests:** 50 Node test files are present. No `.github/workflows` files were found in the repository.

## Verified results

| Check | Result | Evidence |
|---|---|---|
| Full automated suite | Passed; final count recorded in [regression-test-report.md](./regression-test-report.md) | `npm test` |
| TypeScript and production build | Passed; Vite reports a 612.18 kB main JS chunk (172.23 kB gzip), above its 500 kB warning threshold | `npm run build` |
| Archive authorization and privacy | Passed in local PGlite fixtures | Admin-only archive RPCs, private-note exclusion, meeting-link exclusion, member visibility, restore behavior |
| Archive empty-page regression | Fixed and covered by tests | Empty out-of-range result now returns the UI to page 1 |
| Migration plan | Passed as a local dry run; no migration was applied | `npm run db:plan` |
| Deployment config | Passed | `npm run deploy:check` |
| Local browser smoke | Passed for landing; authenticated admin archive view loaded, archived tab showed an empty state, and a non-platform-admin account had no admin link and was denied direct `/admin` navigation | Read-only browser inspection; the non-admin account is a founder in its study circle; no archive/restore operation; backend identity not independently established |

## Findings

### Confirmed and fixed

- **Archive pagination edge case:** When an action emptied the current final page, the RPC returned no rows (and therefore no `total_count` row); the UI then hid pagination and could strand the administrator. The UI now returns to the first page after a successful empty result on a later page. A focused regression test covers the empty-page transition and preserves valid-page behavior.

### Member-facing observations

- Read-only navigation covered the member home, daily/weekly/monthly planning, goals, learning journey, reflection, adhkar, Tawasi, study circles, course entitlement gate, payment history, member sharing, notifications, profile, and settings. Detailed results and limits are in the [member-facing browser matrix](./regression-test-report.md#member-facing-browser-matrix-2026-11-01).
- After the initial read-only pass, the user confirmed that the connected backend is isolated staging with editable test data and designated the current account disposable. Limited temporary daily/weekly planner, goal, and adhkar records were created, verified after reload, and cleaned up; a temporary local reflection was also saved/reloaded/deleted. The staging identity and user-provided disposable-account status were not independently checked.
- The member session represented a platform non-admin but had founder privileges in its circle; it does not establish ordinary circle-member behavior.
- In a follow-up session, the user signed in with a separate ordinary non-admin account. Direct `/admin` navigation was denied; the account had no study circles or Tawasi groups, the live invitation RPC returned no pending invitations, the notification invitation category was empty, and member sharing required creating a username. No invitation, group creation, or profile setup was submitted. Thus the admin boundary and empty states were observed, but ordinary participant permissions inside an existing circle remain unverified. Username-based invitations cannot target this account until a discoverable username is set; a join-code request must be submitted and approved.
- Source review found that pending study-circle invitation loading ignored RPC errors, which could make a failed load look like no invitations. The UI now displays a visible error; a mocked RPC 500 was confirmed to display it. Afterward, the current account's live RPC completed successfully and returned no pending invitations. This does not change membership assignment or establish whether a previously accepted/rejected invitation or approved join request created membership.

### Confirmed residual risks / incomplete verification

- **Role coverage is incomplete:** The admin archive panel loaded in an authenticated administrator session. Both the founder account and a separate ordinary non-admin account were denied direct `/admin`; the latter had no circle memberships, so ordinary participant permissions inside an existing circle were not exercised. No teacher session was tested. The archive was empty, so member visibility after an actual archived item could not be checked.
- **Member writes and persistence are only partially verified:** Daily/weekly planner entries, a goal, a custom adhkar counter, and a local reflection passed limited create/reload/delete checks. Temporary profile-name and notification-preference changes persisted across reload and were restored. Goal-step completion, notification read-state changes, sharing, invitations, group member actions, and payment checkout remain untested.
- **Prayer-time schedule is only partially validated:** The daily plan displayed prayer-period intervals and suggested activities. The browser pass did not verify the source or accuracy of prayer times, location settings, or saved schedule changes.
- **Production behavior is not inferred from local results:** The migration dry run only listed local migrations; this audit did not connect to or alter Supabase.
- **Performance is not fully measured:** The main bundle warning is confirmed by the build. No request-latency, database-load, or concurrent-user benchmark was run.
- **Operational readiness is not established:** Backup restoration, rate limits, monitoring, production headers, provider Sandbox checkout, and deployment behavior were not exercised in this pass. The previous [production readiness audit](../PRODUCTION_READINESS_AUDIT.md) records related open checks; those historical checks were not repeated here.
- **CI automation:** No workflow files were found; automated tests were run locally rather than in a CI pipeline.

## Assessment

The local codebase passes its automated suite, TypeScript build, and the checked configuration commands. Read-only navigation covered a broad set of member screens, and the archive regression found during this pass is fixed and covered. The application is **not declared production-ready**: member write/persistence journeys, ordinary circle-member and teacher role coverage, and operational checks remain outstanding. See the [execution tracker](./EXECUTION-TRACKER.md) and [known issues](./known-issues.md).
