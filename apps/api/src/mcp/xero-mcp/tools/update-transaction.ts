/**
 * Update Transaction Category in Xero
 */

import { XeroClient, BankTransaction, LineItem } from 'xero-node';
import { UpdateTransactionResult } from '../types';
import { handleXeroError } from '../utils/error-handler';
import { Logger } from '../utils/logger';

const logger = new Logger('UpdateTransaction');

export async function updateTransaction(
  xeroClient: XeroClient,
  xeroTenantId: string,
  transactionId: string,
  accountCode: string,
): Promise<UpdateTransactionResult> {
  const startTime = Date.now();

  try {
    logger.info('Updating transaction', {
      xeroTenantId,
      transactionId,
      accountCode,
    });

    // First get the existing transaction
    const getResponse = await xeroClient.accountingApi.getBankTransaction(
      xeroTenantId,
      transactionId,
    );

    const existingTxn = getResponse.body.bankTransactions?.[0];
    if (!existingTxn) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Update the account code on line items
    const updatedLineItems: LineItem[] = (existingTxn.lineItems ?? []).map(
      (item) => ({
        ...item,
        accountCode,
      }),
    );

    const bankTransaction: BankTransaction = {
      ...existingTxn,
      lineItems: updatedLineItems,
    };

    // Update the transaction
    await xeroClient.accountingApi.updateBankTransaction(
      xeroTenantId,
      transactionId,
      { bankTransactions: [bankTransaction] },
    );

    const result: UpdateTransactionResult = {
      transactionId,
      accountCode,
      updatedAt: new Date(),
    };

    logger.logAPICall(
      'update_transaction',
      xeroTenantId,
      true,
      Date.now() - startTime,
    );
    return result;
  } catch (error) {
    logger.logAPICall(
      'update_transaction',
      xeroTenantId,
      false,
      Date.now() - startTime,
      error instanceof Error ? error : new Error(String(error)),
    );
    handleXeroError(error);
  }
}
