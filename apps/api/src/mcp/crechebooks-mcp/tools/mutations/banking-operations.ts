/**
 * Banking Operations MCP Tools
 *
 * MCP tools for bank account management and Open Banking integration.
 */

import { z } from 'zod';

// ============================================
// Tool Definitions
// ============================================

/**
 * list_bank_accounts - List all linked bank accounts
 */
export const listBankAccountsTool = {
  name: 'list_bank_accounts',
  description:
    'List all linked bank accounts for the tenant with current balances and sync status',
  inputSchema: z.object({
    tenantId: z.string().uuid().describe('The tenant ID'),
    activeOnly: z
      .boolean()
      .optional()
      .describe('Filter to only active accounts'),
  }),
  handler: async (input: { tenantId: string; activeOnly?: boolean }) => {
    // This is a placeholder - actual implementation would call the banking service
    return {
      success: true,
      data: {
        accounts: [],
        total_balance_cents: 0,
        message: 'Bank accounts retrieved successfully',
      },
    };
  },
};

/**
 * sync_bank_account - Trigger a manual sync for a bank account
 */
export const syncBankAccountTool = {
  name: 'sync_bank_account',
  description:
    'Trigger a manual synchronization of transactions from a bank account via Open Banking API',
  inputSchema: z.object({
    tenantId: z.string().uuid().describe('The tenant ID'),
    accountId: z.string().uuid().describe('The bank account ID to sync'),
    fromDate: z
      .string()
      .optional()
      .describe('Start date for sync (YYYY-MM-DD)'),
    toDate: z.string().optional().describe('End date for sync (YYYY-MM-DD)'),
  }),
  handler: async (input: {
    tenantId: string;
    accountId: string;
    fromDate?: string;
    toDate?: string;
  }) => {
    return {
      success: true,
      data: {
        transactions_imported: 0,
        transactions_updated: 0,
        sync_duration_ms: 0,
        message: 'Bank account sync completed',
      },
    };
  },
};

/**
 * get_account_balance - Get current balance for a bank account
 */
export const getAccountBalanceTool = {
  name: 'get_account_balance',
  description:
    'Get the current balance and available balance for a linked bank account',
  inputSchema: z.object({
    tenantId: z.string().uuid().describe('The tenant ID'),
    accountId: z.string().uuid().describe('The bank account ID'),
  }),
  handler: async (input: { tenantId: string; accountId: string }) => {
    return {
      success: true,
      data: {
        account_id: input.accountId,
        account_name: '',
        current_balance_cents: 0,
        available_balance_cents: 0,
        pending_balance_cents: 0,
        balance_at: new Date().toISOString(),
        currency: 'ZAR',
      },
    };
  },
};

/**
 * initiate_bank_link - Start OAuth flow to link a bank account
 */
export const initiateBankLinkTool = {
  name: 'initiate_bank_link',
  description:
    'Initiate the Open Banking OAuth flow to link a new bank account. Returns an authorization URL.',
  inputSchema: z.object({
    tenantId: z.string().uuid().describe('The tenant ID'),
    bankCode: z
      .enum(['FNB', 'ABSA', 'STANDARD', 'NEDBANK', 'CAPITEC'])
      .optional()
      .describe('Optional: Pre-select a specific bank'),
    redirectUrl: z
      .string()
      .url()
      .optional()
      .describe('Custom redirect URL after authorization'),
  }),
  handler: async (input: {
    tenantId: string;
    bankCode?: string;
    redirectUrl?: string;
  }) => {
    return {
      success: true,
      data: {
        authorization_url: '',
        state: '',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        message: 'Open the authorization URL to link your bank account',
      },
    };
  },
};

/**
 * unlink_bank_account - Remove a linked bank account
 */
export const unlinkBankAccountTool = {
  name: 'unlink_bank_account',
  description:
    'Unlink a bank account and optionally delete associated transactions',
  inputSchema: z.object({
    tenantId: z.string().uuid().describe('The tenant ID'),
    accountId: z.string().uuid().describe('The bank account ID to unlink'),
    deleteTransactions: z
      .boolean()
      .default(false)
      .describe('Whether to delete imported transactions (default: false)'),
  }),
  handler: async (input: {
    tenantId: string;
    accountId: string;
    deleteTransactions?: boolean;
  }) => {
    return {
      success: true,
      data: {
        unlinked: true,
        transactions_deleted: input.deleteTransactions ? 0 : null,
        message: 'Bank account unlinked successfully',
      },
    };
  },
};

/**
 * check_consent_status - Check Open Banking consent status for accounts
 */
export const checkConsentStatusTool = {
  name: 'check_consent_status',
  description:
    'Check which bank accounts have expiring or expired Open Banking consent',
  inputSchema: z.object({
    tenantId: z.string().uuid().describe('The tenant ID'),
    expiringWithinDays: z
      .number()
      .int()
      .min(1)
      .max(90)
      .default(14)
      .describe('Number of days to check for expiring consent'),
  }),
  handler: async (input: { tenantId: string; expiringWithinDays?: number }) => {
    return {
      success: true,
      data: {
        accounts: [],
        total_expiring: 0,
        total_expired: 0,
        message: 'Consent status checked',
      },
    };
  },
};

// Export all banking tools
export const bankingTools = [
  listBankAccountsTool,
  syncBankAccountTool,
  getAccountBalanceTool,
  initiateBankLinkTool,
  unlinkBankAccountTool,
  checkConsentStatusTool,
];
