import {PaymentGatewayAdapter, PaymentGatewayConfig} from './types';

export interface PaymentGatewayEnv {
  PAYMENT_GATEWAY_XPAY_MERCHANT_ID?: string;
  PAYMENT_GATEWAY_XPAY_SECRET_KEY?: string;
  PAYMENT_GATEWAY_XPAY_WEBHOOK_SECRET?: string;
  PAYMENT_GATEWAY_XPAY_BASE_URL?: string;
  PAYMENT_GATEWAY_XPAY_CREATE_ORDER_PATH?: string;
  PAYMENT_GATEWAY_XPAY_CALLBACK_PATH?: string;
  PAYMENT_GATEWAY_XPAY_IS_SANDBOX?: string;
  PAYMENT_GATEWAY_XPAY_LIVE?: string;
}

/**
 * Public, client-safe gateway descriptor. Never exposes credentials.
 */
export function resolvePublicPaymentGateway(_env: PaymentGatewayEnv): PaymentGatewayConfig | null {
  return null;
}

/**
 * Server-side gateway resolution. Returns null while the gateway is disabled,
 * and only exposes live operations after explicit operator enablement
 * (`PAYMENT_GATEWAY_XPAY_LIVE=true`) plus a verified merchant configuration.
 */
export function resolveServerPaymentGateway(_env: PaymentGatewayEnv): PaymentGatewayAdapter | null {
  return null;
}
