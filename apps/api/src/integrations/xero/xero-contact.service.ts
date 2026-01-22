/**
 * XeroContactService
 * TASK-XERO-010: Xero Contact and Payment Sync
 *
 * Service for synchronizing CrecheBooks Parent records with Xero Contacts.
 * Handles finding existing contacts by email and creating new ones.
 *
 * CRITICAL: All operations must filter by tenantId.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

import { PrismaService } from '../../database/prisma/prisma.service';
import { XeroRateLimiter } from './xero-rate-limiter.service';
import {
  ContactSyncResponseDto,
  BulkContactSyncResponseDto,
  XeroContactSearchResult,
} from './dto/xero-contact.dto';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

/**
 * Xero API Contact payload structure
 */
interface XeroContactPayload {
  Contacts: Array<{
    Name: string;
    FirstName?: string;
    LastName?: string;
    EmailAddress?: string;
    ContactStatus?: string;
    IsCustomer?: boolean;
  }>;
}

/**
 * Xero API Contact response structure
 */
interface XeroContactResponse {
  Contacts?: Array<{
    ContactID: string;
    Name: string;
    FirstName?: string;
    LastName?: string;
    EmailAddress?: string;
    ContactStatus: string;
    IsCustomer?: boolean;
    IsSupplier?: boolean;
  }>;
}

@Injectable()
export class XeroContactService {
  private readonly logger = new Logger(XeroContactService.name);
  private readonly xeroApiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly rateLimiter: XeroRateLimiter,
  ) {
    this.xeroApiUrl =
      this.configService.get<string>('XERO_API_URL') ||
      'https://api.xero.com/api.xro/2.0';
  }

  /**
   * Get or create a Xero contact for a parent record.
   * First attempts to find by email, then creates if not found.
   *
   * @param tenantId - The CrecheBooks tenant ID
   * @param parentId - The CrecheBooks parent ID
   * @returns Contact sync response
   */
  async getOrCreateContact(
    tenantId: string,
    parentId: string,
  ): Promise<ContactSyncResponseDto> {
    this.logger.log(
      `Getting or creating Xero contact for parent ${parentId} in tenant ${tenantId}`,
    );

    // Check for existing mapping
    const existingMapping = await this.prisma.xeroContactMapping.findUnique({
      where: {
        tenantId_parentId: { tenantId, parentId },
      },
    });

    if (existingMapping) {
      this.logger.log(
        `Found existing mapping for parent ${parentId}: ${existingMapping.xeroContactId}`,
      );
      return {
        parentId,
        xeroContactId: existingMapping.xeroContactId,
        xeroContactName: existingMapping.xeroContactName ?? '',
        wasCreated: false,
        syncedAt: existingMapping.lastSyncedAt,
      };
    }

    // Get parent details
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
    });

    if (!parent) {
      throw new NotFoundException('Parent', parentId);
    }

    // Get Xero credentials
    const { accessToken, xeroTenantId } =
      await this.getXeroCredentials(tenantId);

    // Try to find existing contact by email
    let xeroContact: XeroContactSearchResult | null = null;

    if (parent.email) {
      xeroContact = await this.findContactByEmail(
        accessToken,
        xeroTenantId,
        parent.email,
      );
    }

    let wasCreated = false;

    // Create contact if not found
    if (!xeroContact) {
      xeroContact = await this.createXeroContact(accessToken, xeroTenantId, {
        firstName: parent.firstName,
        lastName: parent.lastName,
        email: parent.email ?? undefined,
        phone: parent.phone ?? undefined,
      });
      wasCreated = true;
    }

    // Create mapping record
    const now = new Date();
    const mapping = await this.prisma.xeroContactMapping.create({
      data: {
        tenantId,
        parentId,
        xeroContactId: xeroContact.contactId,
        xeroContactName: xeroContact.name,
        lastSyncedAt: now,
      },
    });

    // Also update the parent's xeroContactId field for quick lookup
    await this.prisma.parent.update({
      where: { id: parentId },
      data: { xeroContactId: xeroContact.contactId },
    });

    this.logger.log(
      `${wasCreated ? 'Created' : 'Found'} Xero contact ${xeroContact.contactId} for parent ${parentId}`,
    );

    return {
      parentId,
      xeroContactId: xeroContact.contactId,
      xeroContactName: xeroContact.name,
      wasCreated,
      syncedAt: mapping.lastSyncedAt,
    };
  }

  /**
   * Find a Xero contact by email address.
   *
   * @param accessToken - Xero access token
   * @param xeroTenantId - Xero tenant ID
   * @param email - Email to search for
   * @returns Contact if found, null otherwise
   */
  async findContactByEmail(
    accessToken: string,
    xeroTenantId: string,
    email: string,
  ): Promise<XeroContactSearchResult | null> {
    this.logger.debug(`Searching for Xero contact with email: ${email}`);

    // Acquire rate limit slot
    const slot = await this.rateLimiter.acquireSlot(xeroTenantId);
    if (!slot.allowed) {
      this.logger.warn('Rate limit exceeded, waiting...');
      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<XeroContactResponse>(
          `${this.xeroApiUrl}/Contacts`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Xero-Tenant-Id': xeroTenantId,
              Accept: 'application/json',
            },
            params: {
              where: `EmailAddress=="${email}"`,
            },
          },
        ),
      );

      const contacts = response.data.Contacts ?? [];

      if (contacts.length > 0) {
        const contact = contacts[0];
        this.logger.debug(`Found contact: ${contact.ContactID}`);
        return {
          contactId: contact.ContactID,
          name: contact.Name,
          firstName: contact.FirstName,
          lastName: contact.LastName,
          emailAddress: contact.EmailAddress,
          contactStatus: contact.ContactStatus,
          isCustomer: contact.IsCustomer,
          isSupplier: contact.IsSupplier,
        };
      }

      return null;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError?.isAxiosError || axiosError?.response) {
        if (axiosError.response?.status === 404) {
          return null;
        }
        this.logger.error(
          `Xero API error searching contacts: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data)}`,
        );
      }
      throw new BusinessException(
        'Failed to search Xero contacts',
        'XERO_CONTACT_SEARCH_FAILED',
        {
          email,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Create a new contact in Xero.
   *
   * @param accessToken - Xero access token
   * @param xeroTenantId - Xero tenant ID
   * @param contactData - Contact details
   * @returns Created contact
   */
  async createXeroContact(
    accessToken: string,
    xeroTenantId: string,
    contactData: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
    },
  ): Promise<XeroContactSearchResult> {
    this.logger.log(
      `Creating Xero contact: ${contactData.firstName} ${contactData.lastName}`,
    );

    // Acquire rate limit slot
    const slot = await this.rateLimiter.acquireSlot(xeroTenantId);
    if (!slot.allowed) {
      this.logger.warn('Rate limit exceeded, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const contactName = `${contactData.firstName} ${contactData.lastName}`;

    const payload: XeroContactPayload = {
      Contacts: [
        {
          Name: contactName,
          FirstName: contactData.firstName,
          LastName: contactData.lastName,
          EmailAddress: contactData.email,
          IsCustomer: true,
        },
      ],
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<XeroContactResponse>(
          `${this.xeroApiUrl}/Contacts`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Xero-Tenant-Id': xeroTenantId,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
        ),
      );

      const contacts = response.data.Contacts ?? [];

      if (contacts.length === 0) {
        throw new BusinessException(
          'No contact returned from Xero API',
          'XERO_CONTACT_CREATE_EMPTY_RESPONSE',
        );
      }

      const contact = contacts[0];
      this.logger.log(`Created Xero contact: ${contact.ContactID}`);

      return {
        contactId: contact.ContactID,
        name: contact.Name,
        firstName: contact.FirstName,
        lastName: contact.LastName,
        emailAddress: contact.EmailAddress,
        contactStatus: contact.ContactStatus,
        isCustomer: contact.IsCustomer,
        isSupplier: contact.IsSupplier,
      };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }

      const axiosError = error as AxiosError<{
        Elements?: Array<{ ValidationErrors?: Array<{ Message: string }> }>;
      }>;
      if (axiosError?.isAxiosError || axiosError?.response) {
        this.logger.error(
          `Xero API error creating contact: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data)}`,
        );

        // Handle validation errors
        if (axiosError.response?.status === 400) {
          const validationErrors =
            axiosError.response.data?.Elements?.[0]?.ValidationErrors;
          if (validationErrors && validationErrors.length > 0) {
            throw new BusinessException(
              validationErrors[0].Message,
              'XERO_CONTACT_VALIDATION_ERROR',
              { validationErrors },
            );
          }
        }
      }

      throw new BusinessException(
        'Failed to create Xero contact',
        'XERO_CONTACT_CREATE_FAILED',
        {
          contactName,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Sync multiple parents to Xero contacts in bulk.
   *
   * @param tenantId - The CrecheBooks tenant ID
   * @param parentIds - Array of parent IDs to sync (optional, syncs all if not provided)
   * @returns Bulk sync response
   */
  async bulkSyncContacts(
    tenantId: string,
    parentIds?: string[],
  ): Promise<BulkContactSyncResponseDto> {
    this.logger.log(`Starting bulk contact sync for tenant ${tenantId}`);

    const result: BulkContactSyncResponseDto = {
      synced: 0,
      failed: 0,
      skipped: 0,
      results: [],
      errors: [],
    };

    // Get parents to sync
    const whereClause: {
      tenantId: string;
      isActive: boolean;
      deletedAt: null;
      id?: { in: string[] };
    } = {
      tenantId,
      isActive: true,
      deletedAt: null,
    };

    if (parentIds && parentIds.length > 0) {
      whereClause.id = { in: parentIds };
    }

    const parents = await this.prisma.parent.findMany({
      where: whereClause,
      include: {
        xeroContactMapping: true,
      },
    });

    this.logger.log(`Found ${parents.length} parents to sync`);

    for (const parent of parents) {
      // Skip if already mapped
      if (parent.xeroContactMapping) {
        result.skipped++;
        continue;
      }

      try {
        const syncResult = await this.getOrCreateContact(tenantId, parent.id);
        result.results.push(syncResult);
        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          parentId: parent.id,
          error: error instanceof Error ? error.message : String(error),
          code: error instanceof BusinessException ? error.code : 'SYNC_ERROR',
        });
      }
    }

    this.logger.log(
      `Bulk contact sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed`,
    );

    return result;
  }

  /**
   * Get contact mapping for a parent.
   *
   * @param tenantId - The CrecheBooks tenant ID
   * @param parentId - The CrecheBooks parent ID
   * @returns Contact mapping or null
   */
  async getContactMapping(
    tenantId: string,
    parentId: string,
  ): Promise<{
    id: string;
    xeroContactId: string;
    xeroContactName: string | null;
    lastSyncedAt: Date;
  } | null> {
    const mapping = await this.prisma.xeroContactMapping.findUnique({
      where: {
        tenantId_parentId: { tenantId, parentId },
      },
    });

    return mapping;
  }

  /**
   * Delete contact mapping (does not delete contact in Xero).
   *
   * @param tenantId - The CrecheBooks tenant ID
   * @param parentId - The CrecheBooks parent ID
   */
  async deleteContactMapping(
    tenantId: string,
    parentId: string,
  ): Promise<void> {
    await this.prisma.xeroContactMapping.delete({
      where: {
        tenantId_parentId: { tenantId, parentId },
      },
    });

    // Also clear the xeroContactId on the parent
    await this.prisma.parent.update({
      where: { id: parentId },
      data: { xeroContactId: null },
    });

    this.logger.log(`Deleted contact mapping for parent ${parentId}`);
  }

  /**
   * Get Xero credentials for a tenant.
   */
  private async getXeroCredentials(
    tenantId: string,
  ): Promise<{ accessToken: string; xeroTenantId: string }> {
    const xeroToken = await this.prisma.xeroToken.findUnique({
      where: { tenantId },
    });

    if (!xeroToken) {
      throw new BusinessException(
        'No Xero connection found for this tenant. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    // Decrypt and parse tokens
    // Note: In production, this would use the TokenManager
    // For now, we assume the token structure
    const accessToken = await this.getAccessToken(tenantId);
    const xeroTenantId = xeroToken.xeroTenantId;

    return { accessToken, xeroTenantId };
  }

  /**
   * Get access token using TokenManager pattern.
   * This is a simplified version - in production use TokenManager.
   */
  private getAccessToken(tenantId: string): Promise<string> {
    // Import and use TokenManager
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TokenManager } = require('../../mcp/xero-mcp/auth/token-manager');
    const tokenManager = new TokenManager(this.prisma);
    return tokenManager.getAccessToken(tenantId);
  }
}
