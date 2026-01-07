'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XCircle, CheckCircle2, Link2, RefreshCw, Loader2, AlertCircle, Building2, Plus, Trash2, Shield, ArrowRight } from 'lucide-react';
import { useXeroStatus } from '@/hooks/useXeroStatus';
import { xeroApi, XeroBankAccount, BankConnection } from '@/lib/api/xero';
import { useSimplePayStatus } from '@/hooks/use-simplepay';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

export default function IntegrationsSettingsPage() {
  const searchParams = useSearchParams();
  const { status, isLoading, error, syncNow, isSyncing } = useXeroStatus();
  const { status: simplePayStatus, isLoading: simplePayLoading } = useSimplePayStatus();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState<XeroBankAccount[]>([]);
  const [bankConnections, setBankConnections] = useState<BankConnection[]>([]);
  const [isLoadingBankAccounts, setIsLoadingBankAccounts] = useState(false);
  const [bankAccountsError, setBankAccountsError] = useState<string | null>(null);
  const [connectingAccountId, setConnectingAccountId] = useState<string | null>(null);
  const [disconnectingConnectionId, setDisconnectingConnectionId] = useState<string | null>(null);

  // Handle query params for connection result
  const xeroResult = searchParams.get('xero');
  const errorMessage = searchParams.get('message');

  // Load bank accounts when Xero is connected
  const loadBankAccounts = useCallback(async () => {
    if (!status?.isConnected) return;

    setIsLoadingBankAccounts(true);
    setBankAccountsError(null);

    try {
      const [accountsResponse, connectionsResponse] = await Promise.all([
        xeroApi.getBankAccounts(),
        xeroApi.getBankConnections(),
      ]);
      setBankAccounts(accountsResponse.accounts);
      setBankConnections(connectionsResponse.connections);
    } catch (err) {
      console.error('Failed to load bank accounts:', err);
      setBankAccountsError(err instanceof Error ? err.message : 'Failed to load bank accounts');
    } finally {
      setIsLoadingBankAccounts(false);
    }
  }, [status?.isConnected]);

  useEffect(() => {
    loadBankAccounts();
  }, [loadBankAccounts]);

  // Auto-trigger connect if reconnect param is present
  useEffect(() => {
    if (searchParams.get('reconnect') === 'xero' && !status?.isConnected) {
      handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, status?.isConnected]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectError(null);

    try {
      const { authUrl } = await xeroApi.connect();
      // Redirect to Xero OAuth
      window.location.href = authUrl;
    } catch (err) {
      console.error('Failed to initiate Xero connection:', err);
      setConnectError(err instanceof Error ? err.message : 'Failed to connect to Xero');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await xeroApi.disconnect();
      // Refresh the page to update status
      window.location.reload();
    } catch (err) {
      console.error('Failed to disconnect from Xero:', err);
    }
  };

  const handleConnectBankAccount = async (accountId: string) => {
    setConnectingAccountId(accountId);
    try {
      await xeroApi.connectBankAccount(accountId);
      await loadBankAccounts();
    } catch (err) {
      console.error('Failed to connect bank account:', err);
      setBankAccountsError(err instanceof Error ? err.message : 'Failed to connect bank account');
    } finally {
      setConnectingAccountId(null);
    }
  };

  const handleDisconnectBankAccount = async (connectionId: string) => {
    setDisconnectingConnectionId(connectionId);
    try {
      await xeroApi.disconnectBankAccount(connectionId);
      await loadBankAccounts();
    } catch (err) {
      console.error('Failed to disconnect bank account:', err);
      setBankAccountsError(err instanceof Error ? err.message : 'Failed to disconnect bank account');
    } finally {
      setDisconnectingConnectionId(null);
    }
  };

  const isConnected = status?.isConnected ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Link2 className="h-8 w-8" />
          Integrations
        </h1>
        <p className="text-muted-foreground">
          Connect external services and third-party applications
        </p>
      </div>

      {/* Show connection result messages */}
      {xeroResult === 'connected' && (
        <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-lg">
          <CheckCircle2 className="h-5 w-5" />
          <span>Successfully connected to Xero!</span>
        </div>
      )}

      {xeroResult === 'error' && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to connect to Xero: {errorMessage || 'Unknown error'}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Xero
                {isLoading ? (
                  <Badge variant="secondary">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Loading...
                  </Badge>
                ) : isConnected ? (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="h-3 w-3 mr-1" />
                    Not Connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Sync invoices and payments with Xero accounting
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Details */}
          {isConnected && status && (
            <div className="space-y-2 text-sm">
              {status.organizationName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Organization</span>
                  <span className="font-medium">{status.organizationName}</span>
                </div>
              )}
              {status.lastSyncAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last synced</span>
                  <span className="font-medium">
                    {formatDistanceToNow(status.lastSyncAt, { addSuffix: true })}
                  </span>
                </div>
              )}
              {status.lastSyncStatus && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last sync status</span>
                  <Badge
                    variant={status.lastSyncStatus === 'success' ? 'default' : 'destructive'}
                    className={status.lastSyncStatus === 'success' ? 'bg-green-600' : ''}
                  >
                    {status.lastSyncStatus}
                  </Badge>
                </div>
              )}
              {status.errorMessage && (
                <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>{status.errorMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {(error || connectError) && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{connectError || 'Failed to load Xero status'}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {isConnected ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => syncNow()}
                  disabled={isSyncing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
                <Button variant="destructive" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={handleConnect} disabled={isConnecting || isLoading}>
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect to Xero
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bank Accounts Section - Only shown when Xero is connected */}
      {isConnected && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Bank Accounts
                </CardTitle>
                <CardDescription>
                  Connect bank accounts to sync transactions from Xero
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadBankAccounts()}
                disabled={isLoadingBankAccounts}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingBankAccounts ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error message */}
            {bankAccountsError && (
              <div className="flex items-center gap-2 text-sm text-destructive p-2 bg-destructive/10 rounded">
                <AlertCircle className="h-4 w-4" />
                <span>{bankAccountsError}</span>
              </div>
            )}

            {/* Loading state */}
            {isLoadingBankAccounts && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Connected Bank Accounts */}
            {!isLoadingBankAccounts && bankConnections.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Connected Accounts</h4>
                <div className="space-y-2">
                  {bankConnections.map((connection) => (
                    <div
                      key={connection.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-green-50 dark:bg-green-950/20"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">{connection.accountName}</p>
                          <p className="text-sm text-muted-foreground">
                            {connection.bankName} • {connection.accountNumber}
                          </p>
                          {connection.lastSyncAt && (
                            <p className="text-xs text-muted-foreground">
                              Last synced: {formatDistanceToNow(new Date(connection.lastSyncAt), { addSuffix: true })}
                            </p>
                          )}
                          {connection.errorMessage && (
                            <p className="text-xs text-destructive">{connection.errorMessage}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnectBankAccount(connection.id)}
                        disabled={disconnectingConnectionId === connection.id}
                      >
                        {disconnectingConnectionId === connection.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available Bank Accounts */}
            {!isLoadingBankAccounts && bankAccounts.filter(a => !a.isConnected).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Available Accounts</h4>
                <div className="space-y-2">
                  {bankAccounts
                    .filter((account) => !account.isConnected)
                    .map((account) => (
                      <div
                        key={account.accountId}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{account.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {account.bankAccountType} • {account.accountNumber || 'No account number'}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConnectBankAccount(account.accountId)}
                          disabled={connectingAccountId === account.accountId}
                        >
                          {connectingAccountId === account.accountId ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          Connect
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* No accounts found */}
            {!isLoadingBankAccounts && bankAccounts.length === 0 && !bankAccountsError && (
              <div className="text-center py-4 text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No bank accounts found in your Xero organization</p>
              </div>
            )}

            {/* All accounts connected */}
            {!isLoadingBankAccounts &&
              bankAccounts.length > 0 &&
              bankAccounts.every((a) => a.isConnected) &&
              bankConnections.length > 0 && (
                <div className="text-center py-2 text-sm text-muted-foreground">
                  All available bank accounts are connected
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* SimplePay Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                SimplePay
                {simplePayLoading ? (
                  <Badge variant="secondary">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Loading...
                  </Badge>
                ) : simplePayStatus?.isConnected ? (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="h-3 w-3 mr-1" />
                    Not Connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Payroll integration for employee sync, payslips, and tax certificates
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {simplePayStatus?.isConnected && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employees synced</span>
                <span className="font-medium text-green-600">{simplePayStatus.employeesSynced}</span>
              </div>
              {simplePayStatus.employeesOutOfSync > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Out of sync</span>
                  <span className="font-medium text-yellow-600">{simplePayStatus.employeesOutOfSync}</span>
                </div>
              )}
              {simplePayStatus.lastSyncAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last synced</span>
                  <span className="font-medium">
                    {formatDistanceToNow(new Date(simplePayStatus.lastSyncAt), { addSuffix: true })}
                  </span>
                </div>
              )}
            </div>
          )}
          <Button asChild>
            <Link href="/settings/integrations/simplepay">
              {simplePayStatus?.isConnected ? 'Manage SimplePay' : 'Connect SimplePay'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            WhatsApp Business
            <Badge variant="secondary">Coming Soon</Badge>
          </CardTitle>
          <CardDescription>
            Send payment reminders via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Configure WhatsApp</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Email (SMTP)
            <Badge variant="secondary">Coming Soon</Badge>
          </CardTitle>
          <CardDescription>
            Configure custom email sending
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Configure Email</Button>
        </CardContent>
      </Card>
    </div>
  );
}
