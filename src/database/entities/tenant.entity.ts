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

export interface ITenant {
  id: string;
  name: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  taxStatus: TaxStatus;
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
  createdAt: Date;
  updatedAt: Date;
}
