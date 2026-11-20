# Known Issues and Verification Gaps

**Updated:** 2026-11-01

## Confirmed defect fixed

- **Admin archive pagination:** A successful operation that emptied a later page could leave the UI with no navigation controls. Fixed by returning to the first page after an empty result from a later page. Regression tests pass; see [regression-test-report.md](./regression-test-report.md).

## Open verification gaps

- **Member write/persistence flows:** Limited daily/weekly planner, goal, local-reflection, adhkar, profile-name, and notification-preference changes passed persistence/reversal checks on user-confirmed staging. Goal-step completion, notification read-state, sharing, invitations, group membership actions, export/import, and logout persistence remain untested; see [regression-test-report.md](./regression-test-report.md).
- **Ordinary circle-member/teacher flows:** Ordinary non-admin account behavior is partially verified: it was denied direct `/admin`, but had no existing circle membership to exercise participant controls. The previously tested non-admin account is a circle founder. Teacher flow remains untested; see the follow-up section in [regression-test-report.md](./regression-test-report.md).
- **Study invitation/membership:** A silent invitation-load failure was fixed and verified with a mocked error. The current ordinary account's live invitation query returned no pending invitations, and its invitation notification category was empty. The account has not set a discoverable sharing username, so username-based direct invitations cannot target it yet. For code-link invitations, it must submit a join request and await approval. If the user reports prior acceptance/approval, verify the intended circle and account before concluding membership is missing.
- **Archive visibility after an actual archive:** Not tested in the browser because the archive was empty and no content was changed; isolated PGlite tests cover the visibility rule.
- **Prayer-time planning:** The daily plan rendered prayer-period intervals and suggested activities, but location access, time source/accuracy, manual times, and saved schedule behavior were not exercised in the browser.
- **Production database:** No migration or data mutation was performed in this audit. Database integrity and deployed migration state were not rechecked; the migration command run was dry-run only.
- **Recovery and operations:** No backup restore drill, production uptime/log review, rate-limit validation, or load/concurrency test was performed.
- **Responsive/accessibility acceptance:** No full-page desktop/tablet/mobile, keyboard-only, or screen-reader review was performed.
- **Payment provider:** Provider-specific Sandbox flow and merchant approval are outstanding; do not describe the system as production-ready for payments.
- **CI:** No `.github/workflows` files were found; the test/build gate currently relies on local execution.
- **Local dev-server stability:** Vite stopped once during browser navigation and a lazy-loaded page failed to import; after restart, the route loaded. Treat this as a test-environment interruption unless reproduced with a persistent server.

## Confirmed performance warning

- The local production build reports a 612.18 kB main JavaScript chunk (172.23 kB gzip), exceeding Vite's 500 kB warning threshold. No real-user performance budget or load benchmark was run.

## Historical findings not revalidated here

The existing [production readiness audit](../PRODUCTION_READINESS_AUDIT.md) records prior concerns about recovery readiness, deployment verification, and build-tool dependency advisories. This audit did not rerun those checks; review that report before treating them as current.
