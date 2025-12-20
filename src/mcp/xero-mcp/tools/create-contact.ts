/**
 * Create Contact in Xero
 */

import { XeroClient, Contact, Phone } from 'xero-node';
import { CreateContactInput, CreatedContact } from '../types';
import { handleXeroError } from '../utils/error-handler';
import { Logger } from '../utils/logger';

const logger = new Logger('CreateContact');

export async function createContact(
  xeroClient: XeroClient,
  xeroTenantId: string,
  input: Omit<CreateContactInput, 'tenantId'>,
): Promise<CreatedContact> {
  const startTime = Date.now();

  try {
    logger.info('Creating contact', { xeroTenantId, name: input.name });

    const phones: Phone[] = [];
    if (input.phone) {
      phones.push({
        phoneType: Phone.PhoneTypeEnum.DEFAULT,
        phoneNumber: input.phone,
      });
    }

    const contact: Contact = {
      name: input.name,
      firstName: input.firstName,
      lastName: input.lastName,
      emailAddress: input.email,
      phones: phones.length > 0 ? phones : undefined,
      isCustomer: input.isCustomer,
      isSupplier: input.isSupplier,
    };

    const response = await xeroClient.accountingApi.createContacts(
      xeroTenantId,
      { contacts: [contact] },
    );

    const created = response.body.contacts?.[0];
    if (!created) {
      throw new Error('Contact creation failed - no response');
    }

    const result: CreatedContact = {
      contactId: created.contactID ?? '',
      name: created.name ?? input.name,
    };

    logger.logAPICall(
      'create_contact',
      xeroTenantId,
      true,
      Date.now() - startTime,
    );
    return result;
  } catch (error) {
    logger.logAPICall(
      'create_contact',
      xeroTenantId,
      false,
      Date.now() - startTime,
      error instanceof Error ? error : new Error(String(error)),
    );
    handleXeroError(error);
  }
}
