/**
 * Get Invoices from Xero
 */

import { XeroClient } from 'xero-node';
import Decimal from 'decimal.js';
import { XeroInvoice, GetInvoicesInput } from '../types';
import { handleXeroError } from '../utils/error-handler';
import { Logger } from '../utils/logger';

const logger = new Logger('GetInvoices');

export async function getInvoices(
  xeroClient: XeroClient,
  xeroTenantId: string,
  input: Omit<GetInvoicesInput, 'tenantId'>,
): Promise<XeroInvoice[]> {
  const startTime = Date.now();

  try {
    logger.info('Fetching invoices', { xeroTenantId, ...input });

    // Build where clause
    const conditions: string[] = ['Type=="ACCREC"'];
    if (input.status) {
      conditions.push(`Status=="${input.status}"`);
    }
    if (input.fromDate) {
      conditions.push(`Date >= DateTime(${input.fromDate})`);
    }
    if (input.toDate) {
      conditions.push(`Date <= DateTime(${input.toDate})`);
    }
    const where = conditions.join(' && ');

    const response = await xeroClient.accountingApi.getInvoices(
      xeroTenantId,
      undefined, // ifModifiedSince
      where,
    );

    const invoices: XeroInvoice[] = (response.body.invoices ?? []).map(
      (inv) => ({
        invoiceId: inv.invoiceID ?? '',
        invoiceNumber: inv.invoiceNumber ?? '',
        contactId: inv.contact?.contactID ?? '',
        status: inv.status?.toString() ?? 'UNKNOWN',
        issueDate: inv.date ? new Date(inv.date) : new Date(),
        dueDate: inv.dueDate ? new Date(inv.dueDate) : new Date(),
        subtotalCents: new Decimal(inv.subTotal ?? 0)
          .mul(100)
          .round()
          .toNumber(),
        vatCents: new Decimal(inv.totalTax ?? 0).mul(100).round().toNumber(),
        totalCents: new Decimal(inv.total ?? 0).mul(100).round().toNumber(),
        amountPaidCents: new Decimal(inv.amountPaid ?? 0)
          .mul(100)
          .round()
          .toNumber(),
        amountDueCents: new Decimal(inv.amountDue ?? 0)
          .mul(100)
          .round()
          .toNumber(),
      }),
    );

    logger.logAPICall(
      'get_invoices',
      xeroTenantId,
      true,
      Date.now() - startTime,
    );
    return invoices;
  } catch (error) {
    logger.logAPICall(
      'get_invoices',
      xeroTenantId,
      false,
      Date.now() - startTime,
      error instanceof Error ? error : new Error(String(error)),
    );
    handleXeroError(error);
  }
}
