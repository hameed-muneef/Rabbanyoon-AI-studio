export type PaymentProviderCode = 'xpay' | 'paytabs' | 'paymob';

export type PaymentOrderLifecycleStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export type PaymentRefundStatus = 'pending' | 'succeeded' | 'failed';

export interface PaymentGatewayConfig {
  code: PaymentProviderCode;
  name: string;
  isEnabled: boolean;
  isSandbox: boolean;
  baseUrl: string;
  createOrderPath: string;
  callbackPath: string;
  supportedCurrencies: readonly string[];
  supportedMethods: readonly string[];
  feePercent: number;
}

export interface PaymentGatewayCredentials {
  merchantId?: string;
  secretKey?: string;
  webhookSecret?: string;
}

export interface PaymentOrderInput {
  amount: number;
  currencyCode: string;
  idempotencyKey: string;
  description: string;
  subscriptionId?: string | null;
  planId?: string | null;
}

export interface PaymentInitiation {
  provider: PaymentProviderCode;
  providerOrderId: string;
  approvalUrl: string | null;
  clientToken: string | null;
  status: 'pending' | 'processing';
}

export interface CapturedPayment {
  providerOrderId: string;
  status: PaymentOrderLifecycleStatus;
}

export interface RefundRequest {
  paymentProviderId: string;
  amount: number;
  reason: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: PaymentRefundStatus;
  amount: number;
}

export class PaymentGatewayError extends Error {
  readonly code: string;

  constructor(message: string, code = 'gateway_error') {
    super(message);
    this.name = 'PaymentGatewayError';
    this.code = code;
  }
}

/**
 * Provider-agnostic payment gateway contract.
 *
 * Business logic (orders, subscriptions, invoices, refunds, activation) depends
 * only on this interface, so XPay can be swapped for PayTabs/Paymob without
 * touching any payment workflow. Live operations additionally require an
 * operator-enabled configuration; nothing may run against a real provider before
 * merchant verification completes.
 */
export interface PaymentGatewayAdapter {
  readonly code: PaymentProviderCode;
  readonly isSandbox: boolean;
  readonly liveMode: boolean;

  initiateOrder(input: PaymentOrderInput, credentials: PaymentGatewayCredentials): Promise<PaymentInitiation>;
  captureOrder(providerOrderId: string, credentials: PaymentGatewayCredentials, paymentMethodId?: string | null): Promise<CapturedPayment>;
  refundOrder(refund: RefundRequest, credentials: PaymentGatewayCredentials): Promise<RefundResult>;
  cancelOrder(providerOrderId: string, credentials: PaymentGatewayCredentials): Promise<CapturedPayment>;
  getOrderStatus(providerOrderId: string, credentials: PaymentGatewayCredentials): Promise<CapturedPayment>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean>;
}
