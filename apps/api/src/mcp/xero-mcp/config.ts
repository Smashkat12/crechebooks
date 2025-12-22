/**
 * MCP Server Configuration
 */

export interface XeroMCPConfig {
  xeroClientId: string;
  xeroClientSecret: string;
  xeroRedirectUri: string;
  tokenEncryptionKey: string;
  rateLimitRequests: number;
  rateLimitWindowMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(): XeroMCPConfig {
  const xeroClientId = process.env.XERO_CLIENT_ID;
  const xeroClientSecret = process.env.XERO_CLIENT_SECRET;
  const xeroRedirectUri = process.env.XERO_REDIRECT_URI;
  const tokenEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;

  if (!xeroClientId) {
    throw new Error('XERO_CLIENT_ID environment variable is required');
  }

  if (!xeroClientSecret) {
    throw new Error('XERO_CLIENT_SECRET environment variable is required');
  }

  if (!xeroRedirectUri) {
    throw new Error('XERO_REDIRECT_URI environment variable is required');
  }

  if (!tokenEncryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required');
  }

  if (tokenEncryptionKey.length < 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be at least 32 characters');
  }

  return {
    xeroClientId,
    xeroClientSecret,
    xeroRedirectUri,
    tokenEncryptionKey,
    rateLimitRequests: 60,
    rateLimitWindowMs: 60000,
    logLevel: (process.env.LOG_LEVEL as XeroMCPConfig['logLevel']) || 'info',
  };
}
