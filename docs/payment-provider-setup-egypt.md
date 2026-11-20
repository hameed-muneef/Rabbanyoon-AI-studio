# Payment Provider Setup — Egypt First

## Current status

- Initial market: Egypt; EGP is the initial billing currency.
- XPay is a candidate only. No provider is approved, integrated, or verified for production.
- Do not configure production credentials or enable live payment collection.
- The checkout UI is intentionally unavailable. The XPay adapter rejects all operations, and the webhook endpoint has no registered provider adapter and fails closed.
- The provider protocol, official webhook specification, and merchant Sandbox flow have not been verified.

## Provider selection and official documentation

Candidates:

1. XPay — candidate only; not approved.
2. PayTabs — alternative candidate; not implemented.
3. Paymob — alternative candidate; not implemented.

No official provider API documentation has been supplied or verified in this repository. Do not rely on previously documented sample URLs, webhook header names, payload fields, or signature algorithms; those were placeholders and are not implemented. Before selecting a provider, obtain its official merchant integration package and verify:

- Sandbox and production API base URLs and authentication.
- Checkout/session creation and status-query APIs.
- Supported Egypt payment methods, EGP settlement, and refund/cancellation APIs.
- Exact webhook event schema, signature scheme, key rotation, timestamp tolerance, and retry behavior.
- Provider order/payment/refund identifiers and idempotency guarantees.
- Merchant approval, settlement, dispute, and operational requirements.

Record the official documentation URL/version and the date it was verified here after a provider is selected.

## Current architecture

- `src/payments/types.ts` defines the provider-independent adapter contract.
- `src/payments/xpay.ts` is an unavailable stub; it performs no network request and never accepts a webhook signature.
- `src/payments/index.ts` exposes no usable payment provider until a verified adapter is registered.
- `supabase/functions/payment-webhook/` validates the request boundary and dispatches only through a registered provider adapter. Currently no adapter is registered, so callbacks return `503 provider_integration_unavailable`.
- `src/views/PaymentCheckout.tsx` does not create an order or represent an unpaid order as a successful checkout.

The database RPCs and payment tables are not a substitute for provider checkout or webhook verification. Do not call payment activation RPCs as a substitute for a provider-confirmed event.

## Credentials and environment variables

There are no verified XPay-specific environment-variable names yet. Earlier names such as `PAYMENT_GATEWAY_XPAY_SECRET_KEY`, sample base URLs, and guessed API paths must not be used until confirmed by XPay's official documentation.

After provider selection:

- Define the provider-specific variable names from the verified integration contract.
- Store secrets only in the server/Edge Function secret store; never in frontend variables, source control, logs, or the admin dashboard.
- Keep Sandbox and production credentials separate.
- Validate required variables on the server at startup and fail closed when any are missing or inconsistent.
- Do not expose credentials in readiness RPC results or admin UI.

The current webhook boundary does not require provider credentials because it has no registered provider implementation.

## Webhook configuration

The local Edge Function route is:

`https://<project-ref>.supabase.co/functions/v1/payment-webhook?provider=<provider-code>`

The function is not deployed or configured with a provider. Requests for an unknown/unregistered provider are rejected. Do not configure a merchant webhook to treat this endpoint as operational until all of the following are complete:

- Implement and review the selected provider's exact signature and payload verification.
- Validate timestamp/replay protections and normalize events into the provider-independent event schema.
- Persist events through the trusted server-side payment transition path.
- Verify retries, duplicates, cross-order event reuse, ownership, amounts, and currencies.
- Deploy the Edge Function and verify it using provider Sandbox callbacks.

## Automated and Sandbox tests

Run the local suites:

```powershell
node --test tests/payment-operations.test.mjs tests/payment-webhook.test.mjs
npm test
```

The payment operations tests use PGlite and mocked database calls; webhook tests use synthetic provider adapters. They exercise state transitions, authorization, price/currency checks, expiry, cancellation, duplicate/replayed events, concurrent duplicate calls, and fail-closed webhook handling. These tests do not prove compatibility with XPay, PayTabs, Paymob, or any real provider.

Provider Sandbox tests remain pending until an approved provider supplies Sandbox access and official specifications. Run those tests only with Sandbox credentials and test payment instruments. Never use real credentials or real money in automated tests.

## Admin readiness dashboard

The admin panel reports database, selected provider, merchant approval, Sandbox configuration/results, webhook configuration, signature verification, production credential verification, and live-payment state. These are readiness indicators, not proof supplied by a provider. No secret values are displayed.

The current provider signature state is `not_implemented`; live payments are hard-disabled by the readiness migration, which is applied to the configured database. Lifecycle migrations `202611010007`–`202611010008` are also applied. Post-apply catalog checks confirmed the activation hard lock. The latest frontend and Edge Function source are not thereby deployed.

## Production activation checklist

- [ ] Select a provider and obtain its official integration and webhook documentation.
- [ ] Complete merchant onboarding and receive written provider approval for Egypt.
- [ ] Implement and independently review provider authentication, checkout, webhook signature verification, and refund/cancellation mapping.
- [ ] Configure provider Sandbox secrets in the server secret store.
- [ ] Pass the complete provider Sandbox suite, including retries, duplicate/replayed events, refunds, and failure cases.
- [ ] Deploy the verified webhook endpoint and validate provider callback delivery/signatures.
- [ ] Confirm payment database migrations and server-side production configuration are reviewed and applied.
- [ ] Verify production credentials and webhook configuration without exposing secrets.
- [ ] Obtain explicit administrator approval through the server-controlled activation process after its prerequisites are actually verified.
- [ ] Perform a separately approved production smoke test only after all prior checks; do not use live payments during automated tests.

Live payment collection is not production-ready and remains disabled. Merchant approval, provider Sandbox verification, deployment, and explicit production activation are all outstanding.
