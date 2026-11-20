const ORDER_STATUSES = new Set([
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded'
]);
const INTERNAL_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 64 * 1024;

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function logFailure(message, providerCode, error) {
  const errorType = error instanceof Error ? error.name : typeof error;
  console.error(message, {provider: providerCode, error_type: errorType});
}

async function readBoundedBody(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    return null;
  }
}

function isValidEvent(event) {
  return event !== null
    && typeof event === 'object'
    && typeof event.eventId === 'string'
    && event.eventId.trim().length > 0
    && event.eventId.length <= 200
    && typeof event.orderId === 'string'
    && INTERNAL_ORDER_ID.test(event.orderId)
    && typeof event.providerOrderId === 'string'
    && event.providerOrderId.trim().length > 0
    && typeof event.providerPaymentId === 'string'
    && event.providerPaymentId.trim().length > 0
    && typeof event.status === 'string'
    && ORDER_STATUSES.has(event.status)
    && (event.status === 'pending' || event.status === 'processing'
      || (typeof event.amount === 'number' && Number.isFinite(event.amount) && event.amount > 0
        && typeof event.currencyCode === 'string' && /^[A-Z]{3}$/.test(event.currencyCode)));
}

/**
 * Provider adapters must verify the exact provider-documented signature and
 * normalize the event before it reaches processVerifiedEvent. No provider is
 * registered until its protocol has been verified against official docs.
 */
export function createPaymentWebhookHandler({providers = new Map(), processVerifiedEvent} = {}) {
  return async function handlePaymentWebhook(request) {
    if (request.method !== 'POST') return response(405, {error: 'method_not_allowed'});

    const url = new URL(request.url);
    const providerCode = url.searchParams.get('provider')?.trim().toLowerCase();
    if (!providerCode || !/^[a-z0-9_-]{2,40}$/.test(providerCode)) {
      return response(400, {error: 'provider_required'});
    }

    const provider = providers.get(providerCode);
    if (!provider) return response(503, {error: 'provider_integration_unavailable'});

    const rawBody = await readBoundedBody(request);
    if (rawBody === null) return response(413, {error: 'invalid_or_oversized_body'});

    let event;
    try {
      event = await provider.verifyAndParse({
        rawBody,
        headers: request.headers,
        url
      });
    } catch (error) {
      logFailure('Payment webhook verification failed', providerCode, error);
      return response(401, {error: 'invalid_webhook'});
    }
    if (!isValidEvent(event)) return response(401, {error: 'invalid_webhook'});

    if (event.status === 'pending' || event.status === 'processing') {
      return response(200, {ok: true, ignored: true, status: event.status});
    }
    if (typeof processVerifiedEvent !== 'function') {
      return response(503, {error: 'payment_state_transition_unavailable'});
    }

    try {
      await processVerifiedEvent(providerCode, event);
      return response(200, {ok: true});
    } catch (error) {
      logFailure('Payment state transition failed', providerCode, error);
      return response(503, {error: 'payment_state_transition_failed'});
    }
  };
}
