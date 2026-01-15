export enum TaxStatus {
  VAT_REGISTERED = 'VAT_REGISTERED',
  NOT_REGISTERED = 'NOT_REGISTERED',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}

/**
 * VAT threshold alert levels for approaching R1,000,000 annual turnover
 * - NONE: Below R800,000
 * - APPROACHING: R800,000 - R949,999
 * - IMMINENT: R950,000 - R999,999
 * - EXCEEDED: R1,000,000+
 */
export enum VatThresholdAlertLevel {
  NONE = 'NONE',
  APPROACHING = 'APPROACHING',
  IMMINENT = 'IMMINENT',
  EXCEEDED = 'EXCEEDED',
}

export interface ITenant {
  id: string;
  name: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  taxStatus: TaxStatus;
  vatRegistrationDate: Date | null;
  cumulativeTurnoverCents: bigint;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  xeroTenantId: string | null;
  subscriptionStatus: SubscriptionStatus;
  invoiceDayOfMonth: number;
  invoiceDueDays: number;
  closureDates: string[];
  // TASK-RECON-002: Amount tolerance for transaction matching (in cents)
  matchingToleranceCents: number;
  createdAt: Date;
  updatedAt: Date;
}
