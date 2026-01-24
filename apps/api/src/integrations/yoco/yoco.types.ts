/**
 * Yoco Payment Gateway Types
 * TASK-ACCT-011: Online Payment Gateway Integration
 */

export interface YocoCheckoutRequest {
  amount: number; // In cents
  currency: string;
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  metadata?: Record<string, string>;
}

export interface YocoCheckoutResponse {
  id: string;
  redirectUrl: string;
  status: string;
}

export interface YocoWebhookPayload {
  id: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.pending';
  createdDate: string;
  payload: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    metadata?: Record<string, string>;
    paymentMethodDetails?: {
      card?: {
        brand: string;
        last4: string;
        expiryMonth: number;
        expiryYear: number;
      };
    };
  };
}

export interface CreatePaymentLinkParams {
  parentId: string;
  amountCents: number;
  type: 'INVOICE' | 'OUTSTANDING' | 'CUSTOM' | 'REGISTRATION';
  invoiceId?: string;
  description?: string;
  expiryDays?: number;
}

export interface PaymentLinkResponse {
  id: string;
  shortCode: string;
  amountCents: number;
  description: string | null;
  status: string;
  expiresAt: Date | null;
  paymentUrl: string;
}

export interface CheckoutInitiationResponse {
  checkoutUrl: string;
  gatewayId: string;
}

export enum YocoPaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
