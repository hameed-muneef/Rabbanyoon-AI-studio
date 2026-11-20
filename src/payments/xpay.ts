import {
  PaymentGatewayAdapter,
  PaymentGatewayConfig,
  PaymentGatewayCredentials,
  PaymentGatewayError
} from './types';

export interface XPayGatewayOptions {
  config: PaymentGatewayConfig;
  credentials: PaymentGatewayCredentials;
  liveMode: boolean;
}

/**
 * XPay remains a candidate only. No official merchant protocol has been
 * verified, so this adapter deliberately performs no network or signature work.
 */
export function createXPayGateway(_options: XPayGatewayOptions): PaymentGatewayAdapter {
  const unavailable = async (): Promise<never> => {
    throw new PaymentGatewayError(
      'XPay is not available until its official API and webhook specifications are verified.',
      'provider_integration_unavailable'
    );
  };

  return {
    code: 'xpay',
    isSandbox: true,
    liveMode: false,
    initiateOrder: unavailable,
    captureOrder: unavailable,
    refundOrder: unavailable,
    cancelOrder: unavailable,
    getOrderStatus: unavailable,
    verifyWebhookSignature: async () => false
  };
}
