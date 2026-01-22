/**
 * SimplePay Connection Service
 * Manages SimplePay API connection and credentials
 *
 * TASK-STAFF-004: SimplePay Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { SimplePayApiClient } from './simplepay-api.client';
import { EncryptionService } from '../../shared/services/encryption.service';
import {
  ConnectionStatus,
  ISimplePayConnection,
} from '../../database/entities/simplepay.entity';
import { SimplePaySyncStatus } from '@prisma/client';

@Injectable()
export class SimplePayConnectionService {
  private readonly logger = new Logger(SimplePayConnectionService.name);

  constructor(
    private readonly simplePayRepo: SimplePayRepository,
    private readonly apiClient: SimplePayApiClient,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Create or update SimplePay connection
   * API key is encrypted before storage
   */
  async setupConnection(
    tenantId: string,
    clientId: string,
    apiKey: string,
  ): Promise<ISimplePayConnection> {
    this.logger.log(`Setting up SimplePay connection for tenant ${tenantId}`);

    // Encrypt the API key
    const encryptedApiKey = this.encryptionService.encrypt(apiKey);

    const connection = await this.simplePayRepo.upsertConnection(tenantId, {
      clientId,
      apiKey: encryptedApiKey,
      isActive: true,
    });

    this.logger.log(`SimplePay connection established for tenant ${tenantId}`);
    return connection;
  }

  /**
   * Test connection by fetching client info
   */
  async testConnection(
    tenantId: string,
  ): Promise<{ success: boolean; clientName?: string; message?: string }> {
    const connection = await this.simplePayRepo.findConnection(tenantId);
    if (!connection) {
      return { success: false, message: 'No connection configured' };
    }

    const apiKey = this.encryptionService.decrypt(connection.apiKey);
    return this.apiClient.testConnection(apiKey, connection.clientId);
  }

  /**
   * Test connection with provided credentials (before saving)
   */
  async testCredentials(
    clientId: string,
    apiKey: string,
  ): Promise<{ success: boolean; clientName?: string; message?: string }> {
    return this.apiClient.testConnection(apiKey, clientId);
  }

  /**
   * List all clients accessible with the given API key
   * Use this to discover client IDs before setting up connection
   */
  async listAvailableClients(apiKey: string): Promise<{
    success: boolean;
    clients?: Array<{ id: string; name: string }>;
    message?: string;
  }> {
    return this.apiClient.listClients(apiKey);
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(tenantId: string): Promise<ConnectionStatus> {
    const connection = await this.simplePayRepo.findConnection(tenantId);

    if (!connection || !connection.isActive) {
      return {
        isConnected: false,
        clientId: null,
        lastSyncAt: null,
        syncErrorMessage: null,
        employeesSynced: 0,
        employeesOutOfSync: 0,
      };
    }

    const statusCounts =
      await this.simplePayRepo.countEmployeeMappingsByStatus(tenantId);

    return {
      isConnected: true,
      clientId: connection.clientId,
      lastSyncAt: connection.lastSyncAt,
      syncErrorMessage: connection.syncErrorMessage,
      employeesSynced: statusCounts[SimplePaySyncStatus.SYNCED] || 0,
      employeesOutOfSync:
        (statusCounts[SimplePaySyncStatus.OUT_OF_SYNC] || 0) +
        (statusCounts[SimplePaySyncStatus.SYNC_FAILED] || 0),
    };
  }

  /**
   * Disconnect SimplePay integration
   * Removes credentials but keeps historical data
   */
  async disconnect(tenantId: string): Promise<void> {
    this.logger.log(`Disconnecting SimplePay for tenant ${tenantId}`);

    const connection = await this.simplePayRepo.findConnection(tenantId);
    if (connection) {
      await this.simplePayRepo.updateConnectionStatus(tenantId, {
        isActive: false,
      });
    }

    this.logger.log(`SimplePay disconnected for tenant ${tenantId}`);
  }

  /**
   * Get decrypted API key for use
   */
  async getApiKey(tenantId: string): Promise<string> {
    const connection = await this.simplePayRepo.findConnection(tenantId);
    if (!connection) {
      throw new Error('No SimplePay connection found');
    }
    return this.encryptionService.decrypt(connection.apiKey);
  }

  /**
   * Update last sync status
   */
  async updateSyncStatus(
    tenantId: string,
    success: boolean,
    errorMessage?: string,
  ): Promise<void> {
    await this.simplePayRepo.updateConnectionStatus(tenantId, {
      lastSyncAt: new Date(),
      syncErrorMessage: success ? null : errorMessage,
    });
  }

  /**
   * List all employees from SimplePay for debugging
   */
  async listEmployees(tenantId: string): Promise<
    Array<{
      id: number;
      first_name: string;
      last_name: string;
      id_number: string;
      number: string;
      email: string;
    }>
  > {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    interface EmployeeWrapper {
      employee: {
        id: number;
        first_name: string;
        last_name: string;
        id_number?: string;
        number?: string;
        email?: string;
      };
    }

    const response = await this.apiClient.get<EmployeeWrapper[]>(
      `/clients/${clientId}/employees`,
    );

    return response.map((w) => ({
      id: w.employee.id,
      first_name: w.employee.first_name,
      last_name: w.employee.last_name,
      id_number: w.employee.id_number || '',
      number: w.employee.number || '',
      email: w.employee.email || '',
    }));
  }
}
