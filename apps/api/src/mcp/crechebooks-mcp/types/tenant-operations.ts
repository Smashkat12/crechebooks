/**
 * Tenant Operations MCP Type Definitions
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Input/output types for tenant operations.
 */

// ============================================
// Get Tenant Types
// ============================================

/** Input for get_tenant tool */
export interface GetTenantInput {
  tenantId: string;
}

/** Output for get_tenant tool */
export interface GetTenantOutput {
  id: string;
  name: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  taxStatus: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  invoiceDayOfMonth: number;
  invoiceDueDays: number;
  subscriptionStatus: string;
  subscriptionPlan: string;
  trialExpiresAt: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  bankAccountType: string | null;
  xeroConnectedAt: string | null;
  xeroTenantName: string | null;
}

// ============================================
// Update Tenant Types
// ============================================

/** Input for update_tenant tool */
export interface UpdateTenantInput {
  tenantId: string;
  name?: string;
  tradingName?: string;
  vatNumber?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  invoiceDayOfMonth?: number;
  invoiceDueDays?: number;
  bankName?: string;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  bankBranchCode?: string;
  userId?: string;
}

/** Output for update_tenant tool */
export interface UpdateTenantOutput {
  id: string;
  name: string;
  updatedFields: string[];
}
