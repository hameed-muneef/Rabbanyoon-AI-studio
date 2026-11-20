import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentWebhookHandler} from '../supabase/functions/_shared/payment-webhook-core.mjs';

const validEvent = {
  eventId: 'evt-1',
  orderId: '11111111-1111-4111-8111-111111111111',
  providerOrderId: 'provider-order-1',
  providerPaymentId: 'provider-payment-1',
  status: 'succeeded',
  amount: 125,
  currencyCode: 'EGP'
};

test('payment webhook fails closed when provider protocol is not registered', async () => {
  const handler = createPaymentWebhookHandler();
  const response = await handler(new Request('https://example.test/payment-webhook?provider=xpay', {
    method: 'POST',
    body: '{"status":"approved"}'
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {error: 'provider_integration_unavailable'});
});

test('payment webhook requires explicit provider and POST', async () => {
  const handler = createPaymentWebhookHandler();
  assert.equal((await handler(new Request('https://example.test/payment-webhook'))).status, 405);
  const missingProvider = await handler(new Request('https://example.test/payment-webhook', {
    method: 'POST',
    body: '{}'
  }));
  assert.equal(missingProvider.status, 400);
});

test('payment webhook rejects adapter failures and malformed normalized events', async () => {
  const providers = new Map([
    ['bad-signature', {verifyAndParse: async () => { throw new Error('signature invalid'); }}],
    ['malformed', {verifyAndParse: async () => ({...validEvent, amount: '125'})}]
  ]);
  const handler = createPaymentWebhookHandler({providers, processVerifiedEvent: async () => assert.fail('must not dispatch')});

  const badSignature = await handler(new Request('https://example.test/payment-webhook?provider=bad-signature', {
    method: 'POST',
    body: '{}'
  }));
  assert.equal(badSignature.status, 401);

  const malformed = await handler(new Request('https://example.test/payment-webhook?provider=malformed', {
    method: 'POST',
    body: '{}'
  }));
  assert.equal(malformed.status, 401);
});

test('payment webhook dispatches only provider-verified normalized events and retries failed persistence', async () => {
  const dispatched = [];
  const providers = new Map([['test-provider', {
    verifyAndParse: async ({rawBody}) => rawBody === 'valid' ? validEvent : null
  }]]);
  const handler = createPaymentWebhookHandler({
    providers,
    processVerifiedEvent: async (provider, event) => { dispatched.push({provider, event}); }
  });
  const response = await handler(new Request('https://example.test/payment-webhook?provider=test-provider', {
    method: 'POST',
    body: 'valid'
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(dispatched, [{provider: 'test-provider', event: validEvent}]);

  const retryHandler = createPaymentWebhookHandler({
    providers,
    processVerifiedEvent: async () => { throw new Error('database unavailable'); }
  });
  const retry = await retryHandler(new Request('https://example.test/payment-webhook?provider=test-provider', {
    method: 'POST',
    body: 'valid'
  }));
  assert.equal(retry.status, 503);
  assert.deepEqual(await retry.json(), {error: 'payment_state_transition_failed'});
});

test('payment webhook rejects oversized bodies', async () => {
  const handler = createPaymentWebhookHandler({
    providers: new Map([['test-provider', {verifyAndParse: async () => validEvent}]])
  });
  const response = await handler(new Request('https://example.test/payment-webhook?provider=test-provider', {
    method: 'POST',
    headers: {'Content-Length': String(65 * 1024)},
    body: '{}'
  }));
  assert.equal(response.status, 413);
});
