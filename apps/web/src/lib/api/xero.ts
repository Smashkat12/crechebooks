/**
 * Xero API Client
 * TASK-XERO-002: Xero Connection Status Dashboard Widget
 *
 * Client functions for Xero integration API endpoints.
 */

import { apiClient } from './client';
import { endpoints } from './endpoints';

export interface XeroConnectionStatusResponse {
  isConnected: boolean;
  tenantName?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface XeroSyncJobResponse {
  jobId: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  estimatedCompletionAt?: string;
}

export interface XeroConnectionStatus {
  isConnected: boolean;
  lastSyncAt: Date | null;
  tokenExpiresAt: Date | null;
  pendingSyncCount: number;
  syncErrors: number;
  organizationName?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

/**
 * Get Xero connection status
 */
async function getStatus(): Promise<XeroConnectionStatus> {
  const response = await apiClient.get<XeroConnectionStatusResponse>(
    endpoints.xero.status
  );

  const data = response.data;

  // Transform API response to frontend model
  return {
    isConnected: data.isConnected,
    lastSyncAt: data.lastSyncAt ? new Date(data.lastSyncAt) : null,
    tokenExpiresAt: null, // API doesn't expose token expiry directly
    pendingSyncCount: 0, // Future: implement pending count
    syncErrors: data.lastSyncStatus === 'failed' ? 1 : 0,
    organizationName: data.tenantName,
    lastSyncStatus: data.lastSyncStatus,
    errorMessage: data.errorMessage,
  };
}

/**
 * Trigger manual sync
 */
async function syncNow(): Promise<XeroSyncJobResponse> {
  const response = await apiClient.post<XeroSyncJobResponse>(
    endpoints.xero.sync,
    {
      direction: 'bidirectional',
    }
  );

  return response.data;
}

/**
 * Initiate OAuth connection
 */
async function connect(): Promise<{ authUrl: string }> {
  const response = await apiClient.post<{ authUrl: string }>(
    endpoints.xero.connect
  );

  return response.data;
}

/**
 * Disconnect from Xero
 */
async function disconnect(): Promise<{ success: boolean; message?: string }> {
  const response = await apiClient.post<{ success: boolean; message?: string }>(
    endpoints.xero.disconnect
  );

  return response.data;
}

/**
 * Bank account from Xero
 */
export interface XeroBankAccount {
  accountId: string;
  name: string;
  accountNumber: string;
  bankAccountType: string;
  isConnected: boolean;
  connectionId?: string;
}

/**
 * Connected bank account
 */
export interface BankConnection {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  status: string;
  lastSyncAt: string | null;
  errorMessage: string | null;
}

/**
 * Get available bank accounts from Xero
 */
async function getBankAccounts(): Promise<{ accounts: XeroBankAccount[] }> {
  const response = await apiClient.get<{ accounts: XeroBankAccount[] }>(
    endpoints.xero.bankAccounts
  );
  return response.data;
}

/**
 * Get connected bank accounts
 */
async function getBankConnections(): Promise<{ connections: BankConnection[] }> {
  const response = await apiClient.get<{ connections: BankConnection[] }>(
    endpoints.xero.bankConnections
  );
  return response.data;
}

/**
 * Connect a bank account for syncing
 */
async function connectBankAccount(accountId: string): Promise<{ success: boolean; connectionId: string; message: string }> {
  const response = await apiClient.post<{ success: boolean; connectionId: string; message: string }>(
    endpoints.xero.connectBankAccount,
    { accountId }
  );
  return response.data;
}

/**
 * Disconnect a bank account
 */
async function disconnectBankAccount(connectionId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post<{ success: boolean; message: string }>(
    endpoints.xero.disconnectBankAccount,
    { connectionId }
  );
  return response.data;
}

export const xeroApi = {
  getStatus,
  syncNow,
  connect,
  disconnect,
  getBankAccounts,
  getBankConnections,
  connectBankAccount,
  disconnectBankAccount,
};
