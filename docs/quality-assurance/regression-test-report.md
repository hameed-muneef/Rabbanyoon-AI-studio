# Regression Test Report

**Date:** 2026-11-01  
**Environment:** Local Windows worktree; test fixtures use local test infrastructure.

## Final automated results

| Command | Result |
|---|---|
| `npm test` | **119 passed, 0 failed, 0 skipped** |
| Focused archive tests | **3 passed, 0 failed** |
| `npm run build` | Passed: TypeScript project build and Vite production/PWA build |
| `npm run db:plan` | Passed: local migration list/checksum dry run only |
| `npm run deploy:check` | Passed: browser-safe local Supabase config validation |
| `git diff --check` | Passed |

The build emitted the existing-size warning: the main JavaScript chunk is 612.18 kB (172.23 kB gzip), exceeding Vite's 500 kB warning threshold. No build error occurred.

## Member-facing browser matrix (2026-11-01)

The user supplied an authenticated non-platform-admin session. The account was a founder in its study circle, not an ordinary circle participant. The user confirmed that the connected backend is isolated staging with editable test data and that the current account is disposable for testing; both confirmations are user-provided and were not independently checked. Browser checks used the local Vite frontend.

| Member area | Observed result | Limits |
|---|---|---|
| Home and navigation | Loaded; no admin link in this non-admin session | Browser inspection only |
| Direct `/admin` route | Explicitly denied to the authenticated non-admin account | UI route check; database authorization remains covered by automated tests |
| Daily planning | Plan screen rendered with prayer-period intervals, suggested activities, and activity time fields for 2026-11-01. Added a uniquely named temporary activity, saved it, confirmed it remained after refresh, then deleted it and confirmed it was absent after refresh. | Did not save a follow-up state; correctness/source of prayer times and location configuration were not independently verified |
| Weekly planning | Screen loaded with ISO week/date selection, task entry and prior-task controls. Added a temporary task, confirmed it remained after refresh, then deleted it. | Did not move/complete a task or test cross-week date notification |
| Monthly planning | Screen loaded with period selection and goal/plan controls | Did not create or alter a monthly plan |
| Goals | Goal list, search, period summaries, and completion-history filters loaded. Created a temporary goal with a future target date, confirmed it remained after refresh, then deleted it. | Did not add/complete a goal step or test date-boundary behavior; personal goal titles are omitted |
| Learning journey | Current stage and learning resources rendered; later stages and steps were disabled/locked | Did not complete learning activities or attempt API bypass from this account |
| Self-reflection | Saved a temporary non-sensitive review, confirmed it remained after refresh, then deleted it. UI states records are local to the browser and not end-to-end encrypted. | Edit flow was not tested |
| Adhkar | Existing counters and daily/weekly targets rendered. Incremented a counter by 1, corrected it by 1, and confirmed it returned to its original count. Added a temporary monthly counter, confirmed it remained after refresh, then deleted it. | Did not test +10/+100, period rollover, or all counter limits |
| Tawasi groups | Account could list and open its own group; group role was founder | Founder controls were not exercised; this is not ordinary-member role coverage |
| Tawasi invitations/history | Invitations area loaded with empty states; request-to-mentor panel reported no approved mentors; history tab loaded | Did not submit invite, join request, mentorship request, or accept/decline any item |
| Courses / councils | Entitlement gate blocked access; UI presented a monthly price and referred to webhook verification | No checkout attempted; provider Sandbox/merchant flow is not verified |
| Payment history | Page loaded with no subscription, orders, or invoices | Read-only; no payment initiated |
| Member sharing | Inbox and sent tabs loaded with empty states; share composer showed its stages and supported share types | Did not select a recipient or send a share |
| Notifications | Center loaded; displayed all notifications as read and an empty category state | Did not change notification read state or open an item |
| Profile/settings | Saved a temporary profile-name change and notification preference change, confirmed both after refresh, then restored the original values and confirmed restoration. Account security/privacy sections rendered. | Did not test export/import, sign out, or account/local-data deletion |

During the browser pass the local Vite process stopped once, causing a dynamic page import to fail. After restarting it, navigation succeeded. Intermittent network `ERR_CONNECTION_CLOSED` events were also present; these are environment-connectivity observations and were not treated as application feature failures.

## Ordinary non-admin account follow-up (2026-11-01)

The user signed in with a separate ordinary (non-platform-admin) account after the founder-session checks. Direct navigation to `/admin` displayed the explicit no-admin-access response. The study-circle page showed zero enrolled study circles; after the invitation-error fix, the live invitation RPC completed without an error and returned no pending invitations. The invitation notification category was also empty. The Tawasi groups page showed zero groups and stated that creation/management is available without the direct-meeting permission. The sharing page prompted the user to create a sharing username, so no inbox or recipient list was available. The current account therefore cannot be found by the username-based direct invitation flow until it creates a discoverable username.

No invite code was submitted, no group/circle was created or joined, and no username/profile change was made. This confirms the ordinary account/admin boundary and empty-state behavior, but it does not test the role of an ordinary participant *inside an existing circle*. That role still requires a seeded circle and a joined participant account. If the founder intended a username-based invite, the target account needs a discoverable username; if the founder sent a join-code link, the user must submit the code and await approval before membership appears.

The invitation query for pending study-circle invitations previously ignored the RPC's error response. Consequently, a failed request could look identical to an empty invitation list. The client now reports invitation-loading errors visibly. A controlled browser simulation of an RPC 500 displayed the alert; the subsequent live request completed with no error and no pending invitations. This establishes no pending invite for the current session, but cannot distinguish an unlinked account from an invitation/request that was already accepted or never sent.

## Regression cases exercised

- All 50 files in [test-inventory.md](./test-inventory.md) ran in the full Node test command.
- Archive database tests verified admin-only operations, member/anonymous restrictions, archive/restore visibility, exclusion of private reflections and meeting URLs, and continued editing of non-archived plan content using isolated PGlite fixtures.
- New archive pagination tests verify that an empty later page returns to page 1, while an empty first page and a non-empty later page remain stable.
- Local browser smoke checked the landing page and direct `/admin` route. A user-provided authenticated admin session loaded the archive panel; the available tab rendered and the archived tab showed its empty state. A non-platform-admin account had no admin link on its home page and received the explicit no-admin-access response on direct `/admin`. This account is a founder of its circle, so ordinary circle-member controls were not exercised. Inspection was read-only; no archive/restore action was submitted. The configured backend was not independently identified as staging or production.

## Defects fixed

| Defect | Root cause | Fix | Regression evidence |
|---|---|---|---|
| Admin could become stranded on an empty final archive page | The list RPC returns `total_count` on result rows; an out-of-range offset returns no rows, hiding pagination controls | Reset to the first page after a successful empty result from a later page | `admin-content-archive-pagination.test.mjs`; focused archive tests 3/3 |
| Study invitations could be silently shown as absent after a failed request | `StudyCirclesView` consumed invitation RPC data without checking the RPC error | Surface invitation-load errors with an accessible alert instead of showing an indistinguishable empty state | Build/type-check and browser request-failure simulation |

## Not run / blocked

- Ordinary participant-inside-circle and teacher browser journeys, and member visibility after archiving a test item: the follow-up ordinary non-admin account had no enrolled circles, and the earlier non-admin account was a founder. The member-side direct admin-route denial was checked for both accounts, but no live content was archived to test its disappearance.
- Member mutations beyond the limited checks above remain untested: goal-step completion, notification read-state changes, group requests/invitations, sharing, export/import, and payment checkout.
- Full end-to-end checks against a deployed staging environment: not performed; browser checks used the local Vite frontend.
- Production database integrity or migration application: not performed; `db:plan` is a dry run.
- Backup restore, load/concurrency, rate-limit, scheduled job, live-header, and provider Sandbox tests: not performed in this pass.
- The requested complete regression suite was run locally, but does not replace these missing environment-level checks.
