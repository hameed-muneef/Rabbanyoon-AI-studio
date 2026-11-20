# Test Inventory

**Snapshot date:** 2026-11-01  
**Automated test files:** 50  
**Execution rule:** “Passed” below means included in the final `npm test` run recorded in [regression-test-report.md](./regression-test-report.md), not a claim that every possible behavior of that feature is covered.

## Feature and test coverage

| Area | Test file | Coverage area |
|---|---|---|
| Authentication and administration | `admin-access.test.mjs` | Admin access decision behavior |
|  | `admin-user-directory.test.mjs` | Admin user directory |
|  | `admin-content-archive.test.mjs` | Archive roles, privacy boundaries, and restore |
|  | `admin-content-archive-pagination.test.mjs` | Empty/out-of-range archive page recovery |
| Database and deployment controls | `database-migrations.test.mjs` | Migration runner and checksum reconciliation |
|  | `database-schema.test.mjs` | Relational schema constraints |
|  | `security-headers.test.mjs` | Static-host security header configuration |
| Content and resources | `curriculum.test.mjs` | Curriculum structure and progress |
|  | `resource-management.test.mjs` | Resource management |
| Personal planning and tracking | `cloud-state-payload.test.mjs` | Cloud state payload behavior |
|  | `day-timing.test.mjs` | Prayer-relative activity timing |
|  | `day-tracking.test.mjs` | Daily tracking |
|  | `goal-plan.test.mjs` | Goals and plan rules |
|  | `weekly-planning.test.mjs` | Weekly planning |
|  | `hijri.test.mjs` | Hijri date calculations |
|  | `prayer-times.test.mjs` | Prayer-time calculations |
|  | `reading-progress.test.mjs` | Reading progress |
|  | `reports.test.mjs` | Summary/report calculations |
| Learning, courses, and study | `ilm-councils.test.mjs` | Learning council domain behavior |
|  | `ilm-councils-acceptance.test.mjs` | Learning council acceptance scenarios |
|  | `courses-lifecycle.test.mjs` | Course lifecycle |
|  | `course-materials.test.mjs` | Course materials |
|  | `course-registrations.test.mjs` | Course registrations |
|  | `course-sessions.test.mjs` | Course session behavior |
|  | `course-session-recurrence.test.mjs` | Recurrence and date behavior |
|  | `study-tracks.test.mjs` | Study tracks |
|  | `teacher-applications.test.mjs` | Teacher application and review flow |
| Groups, mentorship, and sharing | `private-groups-schema.test.mjs` | Group schema and isolation |
|  | `private-groups-lifecycle.test.mjs` | Group creation, update, and closure |
|  | `private-groups-invites.test.mjs` | Invitations |
|  | `private-groups-joining.test.mjs` | Join requests and decisions |
|  | `private-groups-members.test.mjs` | Member roles and management |
|  | `private-groups-programs.test.mjs` | Group programs and completion |
|  | `circle-progress-sharing.test.mjs` | Optional progress sharing |
|  | `circle-live-sessions.test.mjs` | Group sessions |
|  | `taw-privacy.test.mjs` | Tawasi privacy boundaries |
|  | `tawasi-mentorship.test.mjs` | Mentorship rules and access |
|  | `member-sharing.test.mjs` | Member sharing |
|  | `activity-invitations.test.mjs` | Invitation lifecycle across activities |
|  | `int-integration.test.mjs` | Cross-feature integration scenarios |
| Mudarasa | `mudarasa-foundation.test.mjs` | Mudarasa foundation |
|  | `mudarasa-meetings.test.mjs` | Mudarasa meetings |
|  | `mudarasa-notes.test.mjs` | Notes and privacy |
|  | `mudarasa-questions.test.mjs` | Questions and replies |
| Notifications | `notifications.test.mjs` | Notification behavior |
|  | `notification-center.test.mjs` | Notification center |
| Payments and entitlements | `platform-pricing-admin.test.mjs` | Feature pricing and admin grants |
|  | `payment-operations.test.mjs` | Payment lifecycle and ownership rules |
|  | `payment-webhook.test.mjs` | Webhook validation and duplicate handling |
| Profiles | `user-profile.test.mjs` | Profile behavior |

## Important workflow scenarios requested but not fully covered by this inventory

- Browser registration, confirmation, login, reset-password, and logout using test accounts.
- Authenticated admin/member/teacher UI journeys against a staging deployment.
- Full learning progression through direct API attempts, and cross-module date-boundary journeys with real authenticated state.
- Production backup restoration, live rate limiting, realistic concurrent load, and scheduled/background-job execution.
- Provider-specific payment Sandbox checkout and webhook delivery. No real payment was attempted.
- Screen-reader, keyboard-only, and desktop/tablet/mobile RTL acceptance across every page.

These are tracked as blocked or not run in the [execution tracker](./EXECUTION-TRACKER.md), not as passing tests.
