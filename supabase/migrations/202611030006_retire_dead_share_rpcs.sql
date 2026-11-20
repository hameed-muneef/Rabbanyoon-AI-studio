-- ============ retire dead member-sharing RPCs (2026-11-03) ============
-- Scoped dead-code retirement after full cross-reference audit:
-- these two functions have ZERO references in src/, tests/, scripts/ and
-- no internal SQL callers, so their grants are dead surface area.
--
-- Everything else in member_sharing / activity_invitations / tawasi_member_
-- invitations stays: live admin panels depend on the admin_* RPCs
-- (ShareAdminPanel, ReportsReviewPanel), and the invitation RPCs are
-- exercised by backend tests (member-sharing, activity-invitations,
-- tawasi-member-invitations, notification-center) and internally call
-- private.consume_activity_invite / private.activity_invite_ttl.

drop function if exists public.get_share_config();
drop function if exists public.mark_all_shares_read();
