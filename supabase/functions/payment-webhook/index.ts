// Provider-neutral webhook boundary. Provider adapters are intentionally not
// registered until their official signature and payload specifications exist.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createPaymentWebhookHandler } from "../_shared/payment-webhook-core.mjs";

const handler = createPaymentWebhookHandler();

serve((request: Request) => handler(request));
