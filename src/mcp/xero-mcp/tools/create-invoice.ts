/**
 * Create Invoice in Xero
 */

import { XeroClient, Invoice, LineItem } from 'xero-node';
import Decimal from 'decimal.js';
import { CreateInvoiceInput, CreatedInvoice } from '../types';
import { handleXeroError } from '../utils/error-handler';
import { Logger } from '../utils/logger';

const logger = new Logger('CreateInvoice');

export async function createInvoice(
  xeroClient: XeroClient,
  xeroTenantId: string,
  input: Omit<CreateInvoiceInput, 'tenantId'>,
): Promise<CreatedInvoice> {
  const startTime = Date.now();

  try {
    logger.info('Creating invoice', {
      xeroTenantId,
      contactId: input.contactId,
    });

    // Convert cents to decimal for Xero API
    const lineItems: LineItem[] = input.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitAmount: new Decimal(item.unitAmountCents).div(100).toNumber(),
      accountCode: item.accountCode,
      taxType: item.taxType,
    }));

    const invoice: Invoice = {
      type: Invoice.TypeEnum.ACCREC,
      contact: { contactID: input.contactId },
      lineItems,
      reference: input.reference,
      dueDate: input.dueDate,
      status: Invoice.StatusEnum.DRAFT,
    };

    const response = await xeroClient.accountingApi.createInvoices(
      xeroTenantId,
      { invoices: [invoice] },
    );

    const created = response.body.invoices?.[0];
    if (!created) {
      throw new Error('Invoice creation failed - no response');
    }

    // Convert total back to cents
    const totalCents = new Decimal(created.total ?? 0)
      .mul(100)
      .round()
      .toNumber();

    const result: CreatedInvoice = {
      invoiceId: created.invoiceID ?? '',
      invoiceNumber: created.invoiceNumber ?? '',
      status: created.status?.toString() ?? 'DRAFT',
      totalCents,
    };

    logger.logAPICall(
      'create_invoice',
      xeroTenantId,
      true,
      Date.now() - startTime,
    );
    return result;
  } catch (error) {
    logger.logAPICall(
      'create_invoice',
      xeroTenantId,
      false,
      Date.now() - startTime,
      error instanceof Error ? error : new Error(String(error)),
    );
    handleXeroError(error);
  }
}
