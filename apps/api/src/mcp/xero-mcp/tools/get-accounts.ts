/**
 * Get Chart of Accounts from Xero
 */

import { XeroClient } from 'xero-node';
import { XeroAccount } from '../types';
import { handleXeroError } from '../utils/error-handler';
import { Logger } from '../utils/logger';

const logger = new Logger('GetAccounts');

export async function getAccounts(
  xeroClient: XeroClient,
  xeroTenantId: string,
): Promise<XeroAccount[]> {
  const startTime = Date.now();

  try {
    logger.info('Fetching chart of accounts', { xeroTenantId });

    const response = await xeroClient.accountingApi.getAccounts(xeroTenantId);

    const accounts: XeroAccount[] = (response.body.accounts ?? []).map(
      (account) => ({
        code: account.code ?? '',
        name: account.name ?? '',
        type: account.type?.toString() ?? '',
        taxType: account.taxType ?? null,
        enablePaymentsToAccount: account.enablePaymentsToAccount ?? false,
      }),
    );

    logger.logAPICall(
      'get_accounts',
      xeroTenantId,
      true,
      Date.now() - startTime,
    );
    return accounts;
  } catch (error) {
    logger.logAPICall(
      'get_accounts',
      xeroTenantId,
      false,
      Date.now() - startTime,
      error instanceof Error ? error : new Error(String(error)),
    );
    handleXeroError(error);
  }
}
