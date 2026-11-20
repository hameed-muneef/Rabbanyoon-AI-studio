# Payment and Subscription Security Status

## Scope and status

This review covers the payment migrations, provider adapter boundary, webhook endpoint, checkout UI, readiness dashboard, and payment regression tests in the current worktree.

The current source fails closed for real payment processing: there is no verified provider adapter, XPay performs no network or signature work, and the checkout UI does not create an order. This source has not been deployed as part of this work. Do not infer the deployed application's behavior from local files.

Database deployment status:

- `202611010001`–`202611010005` were applied to the configured Supabase database and their checksums were verified in the prior deployment audit.
- `202611010006`–`202611010008` were applied in one transaction on 2026-11-01 and their checksums were verified against `private.schema_migrations`.
- Post-apply catalog checks confirmed readiness-table RLS, order expiry, webhook/order binding, authenticated/service execution on the success RPC, and `live_enabled=false` with the server-side activation hard lock.
- **Migration history drift:** the local checksum for already-applied `202611010002_payment_operations.sql` differs from the remote ledger checksum. `scripts/database-migrations.mjs` accepts only the verified original/current checksum pair, preserves the remote ledger value, and never reapplies that migration. Any other checksum mismatch still fails; `tests/database-migrations.test.mjs` covers both cases.
- The frontend and Edge Function are not deployed/verified as part of this database operation; provider Sandbox and production payment flows remain untested.

## Controls implemented in source

- Server-side order creation derives amount and currency from the selected active plan.
- Authenticated users cannot create or read another user's payment order; activation requires the privileged server/admin path.
- Payment success validates provider references, status, amount, currency, order state, and expiry.
- Successful-payment event IDs are persisted with their order association; the local success transition rejects/ignores cross-order event reuse without activation.
- State transitions avoid reactivating cancelled/failed/refunded orders and avoid downgrading terminal orders on late failure notifications.
- Refund/cancellation processing is scoped to the purchased feature and preserves unrelated subscriptions.
- Order cancellation does not cancel an already active subscription; user cancellation preserves paid access through the paid-through period.
- Client write grants were removed from the payment gateway, plan, and invoice tables in deployed migration `202611010005`.
- Payment errors avoid logging request bodies or secret values in the current webhook boundary.
- The admin readiness UI shows configuration status without exposing secret credentials; its flags are not treated as provider verification.

## Fail-closed provider boundary

- `src/payments/xpay.ts` is an unavailable stub; `verifyWebhookSignature` always returns false.
- No provider adapter is registered in `supabase/functions/payment-webhook/index.ts`.
- Unknown/unregistered providers receive an unavailable response; unverified or malformed events are not dispatched.
- Official XPay API/webhook documentation was not supplied or verified. No HMAC algorithm, header, URL, or payload mapping should be treated as valid.
- The frontend cannot activate live payments. The readiness migration is now applied remotely and catalog checks confirmed the live activation hard lock; no provider integration exists.

## Known gaps and residual risk

1. **No real provider checkout or webhook signature validation.** This is an intentional block, not a completed integration. Provider-specific authentication, canonicalization, timestamp/replay rules, event mapping, and retry semantics remain unimplemented.
2. **No real provider Sandbox verification.** Synthetic adapters and PGlite do not validate interoperability or provider behavior.
3. **No deployed verification of the latest application source.** Database migrations 006–008 are deployed, but the current frontend/Edge Function source is not confirmed deployed; production behavior must be independently checked before use.
4. **Refund state is local administrative processing only.** The current database RPC records a successful refund transition when called; it is not evidence that a provider actually issued a refund. Wire it only to an authenticated provider response/event and implement retry/reconciliation before offering refunds operationally.
5. **Readiness assertions are operator-entered metadata.** They do not prove merchant approval, provider signature correctness, or actual credential validity. Production activation must remain server-controlled and fail closed.
6. **Concurrency tests use PGlite.** They validate idempotent database behavior in the local test engine, not multi-instance production load or provider retry timing.

## Regression verification

`tests/payment-operations.test.mjs` exercises price/currency validation, authorization, status transitions, expiry, cancellations, refunds, duplicate and cross-order event handling, and idempotent repeated/concurrent calls.

`tests/payment-webhook.test.mjs` exercises the provider-neutral boundary with synthetic adapters, including unavailable providers, invalid adapter/signature results, malformed events, payload size limits, and retriable persistence errors.

Latest verification: focused payment tests 6/6 passed; `npm test` 116/116 passed; `npx tsc --noEmit -p .` passed; `npm run build` passed with the existing Vite chunk-size warning (612 KB exceeds 500 KB); `git diff --check` passed. No test establishes production readiness.

## Required before any production payment

- Obtain and verify official provider documentation and merchant approval.
- Implement and independently review provider authentication, server-side checkout, webhook signature and replay verification, refund/cancellation confirmation, and reconciliation.
- Reconcile the migration 002 checksum drift; deploy reviewed application source and verify the deployed configuration.
- Pass the complete provider Sandbox suite and validate deployed callbacks.
- Validate production credentials server-side, record approval, and require explicit administrator activation only after every prerequisite passes.
- Run a read-only production catalog/configuration verification before enabling any live flow.
