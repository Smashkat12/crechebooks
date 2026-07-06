/**
 * Apply Payment to Invoice in Xero
 */

import { XeroClient, Payment } from 'xero-node';
import Decimal from 'decimal.js';
import { ApplyPaymentInput, CreatedPayment } from '../types';
import { handleXeroError } from '../utils/error-handler';
import { Logger } from '../utils/logger';

const logger = new Logger('ApplyPayment');

export async function applyPayment(
  xeroClient: XeroClient,
  xeroTenantId: string,
  input: Omit<ApplyPaymentInput, 'tenantId'>,
): Promise<CreatedPayment> {
  const startTime = Date.now();

  try {
    logger.info('Applying payment', {
      xeroTenantId,
      invoiceId: input.invoiceId,
    });

    // Convert cents to decimal
    const amount = new Decimal(input.amountCents).div(100).toNumber();

    const payment: Payment = {
      invoice: { invoiceID: input.invoiceId },
      account: { code: input.bankAccountCode },
      amount,
      date: input.paymentDate,
      reference: input.reference,
    };

    const response = await xeroClient.accountingApi.createPayment(
      xeroTenantId,
      payment,
    );

    const created = response.body.payments?.[0];
    if (!created) {
      throw new Error('Payment creation failed - no response');
    }

    const result: CreatedPayment = {
      paymentId: created.paymentID ?? '',
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      paymentDate: created.date ? new Date(created.date) : new Date(),
    };

    logger.logAPICall(
      'apply_payment',
      xeroTenantId,
      true,
      Date.now() - startTime,
    );
    return result;
  } catch (error) {
    logger.logAPICall(
      'apply_payment',
      xeroTenantId,
      false,
      Date.now() - startTime,
      error instanceof Error ? error : new Error(String(error)),
    );
    handleXeroError(error);
  }
}
