/**
 * Get Contacts from Xero
 */

import { XeroClient } from 'xero-node';
import { XeroContact, GetContactsInput } from '../types';
import { handleXeroError } from '../utils/error-handler';
import { Logger } from '../utils/logger';

const logger = new Logger('GetContacts');

export async function getContacts(
  xeroClient: XeroClient,
  xeroTenantId: string,
  input: Omit<GetContactsInput, 'tenantId'> = {},
): Promise<XeroContact[]> {
  const startTime = Date.now();

  try {
    logger.info('Fetching contacts', { xeroTenantId, ...input });

    // Build where clause
    const conditions: string[] = [];
    if (input.isCustomer !== undefined) {
      conditions.push(`IsCustomer==${input.isCustomer}`);
    }
    if (input.isSupplier !== undefined) {
      conditions.push(`IsSupplier==${input.isSupplier}`);
    }
    const where = conditions.length > 0 ? conditions.join(' && ') : undefined;

    const response = await xeroClient.accountingApi.getContacts(
      xeroTenantId,
      undefined, // ifModifiedSince
      where,
    );

    const contacts: XeroContact[] = (response.body.contacts ?? []).map(
      (contact) => ({
        contactId: contact.contactID ?? '',
        name: contact.name ?? '',
        firstName: contact.firstName ?? null,
        lastName: contact.lastName ?? null,
        email: contact.emailAddress ?? null,
        phone: contact.phones?.[0]?.phoneNumber ?? null,
        isSupplier: contact.isSupplier ?? false,
        isCustomer: contact.isCustomer ?? false,
      }),
    );

    logger.logAPICall(
      'get_contacts',
      xeroTenantId,
      true,
      Date.now() - startTime,
    );
    return contacts;
  } catch (error) {
    logger.logAPICall(
      'get_contacts',
      xeroTenantId,
      false,
      Date.now() - startTime,
      error instanceof Error ? error : new Error(String(error)),
    );
    handleXeroError(error);
  }
}
