/**
 * Get Bank Transactions from Xero
 */

import { XeroClient, BankTransaction } from 'xero-node';
import Decimal from 'decimal.js';
import { XeroTransaction, GetTransactionsInput } from '../types';
import { handleXeroError } from '../utils/error-handler';
import { Logger } from '../utils/logger';

const logger = new Logger('GetTransactions');

export async function getTransactions(
  xeroClient: XeroClient,
  xeroTenantId: string,
  input: Omit<GetTransactionsInput, 'tenantId'>,
): Promise<XeroTransaction[]> {
  const startTime = Date.now();

  try {
    logger.info('Fetching bank transactions', { xeroTenantId, ...input });

    // Build date filter
    let where: string | undefined;
    if (input.fromDate || input.toDate) {
      const conditions: string[] = [];
      if (input.fromDate) {
        conditions.push(`Date >= DateTime(${input.fromDate})`);
      }
      if (input.toDate) {
        conditions.push(`Date <= DateTime(${input.toDate})`);
      }
      where = conditions.join(' && ');
    }

    const response = await xeroClient.accountingApi.getBankTransactions(
      xeroTenantId,
      undefined, // ifModifiedSince
      where,
      undefined, // order
      undefined, // page
      undefined, // unitdp
    );

    const transactions: XeroTransaction[] = (
      response.body.bankTransactions ?? []
    ).map((txn) => {
      // Convert decimal amount to cents
      const amountDecimal = new Decimal(txn.total ?? 0);
      const amountCents = amountDecimal.mul(100).round().toNumber();

      return {
        transactionId: txn.bankTransactionID ?? '',
        bankAccount: txn.bankAccount?.accountID ?? '',
        date: txn.date ? new Date(txn.date) : new Date(),
        description: txn.reference ?? '',
        payeeName: txn.contact?.name ?? null,
        reference: txn.reference ?? null,
        amountCents: Math.abs(amountCents),
        isCredit: txn.type === BankTransaction.TypeEnum.RECEIVE,
        accountCode: txn.lineItems?.[0]?.accountCode ?? null,
        status: txn.status?.toString() ?? 'UNKNOWN',
      };
    });

    logger.logAPICall(
      'get_transactions',
      xeroTenantId,
      true,
      Date.now() - startTime,
    );
    return transactions;
  } catch (error) {
    logger.logAPICall(
      'get_transactions',
      xeroTenantId,
      false,
      Date.now() - startTime,
      error instanceof Error ? error : new Error(String(error)),
    );
    handleXeroError(error);
  }
}
