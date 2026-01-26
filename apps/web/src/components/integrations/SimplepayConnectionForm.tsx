'use client';

/**
 * SimplePay Connection Form
 * TASK-STAFF-004: Setup and manage SimplePay connection
 *
 * Allows users to connect, test, and disconnect SimplePay integration.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Link2, Link2Off, RefreshCw, Shield } from 'lucide-react';
import {
  useSimplePayStatus,
  useSimplePayConnect,
  useTestSimplePayConnection,
  useSimplePayDisconnect,
} from '@/hooks/use-simplepay';
import { formatDistanceToNow } from 'date-fns';

export function SimplepayConnectionForm() {
  const { status, isLoading: loadingStatus, isError, error: statusError, mutate } = useSimplePayStatus();
  const connectMutation = useSimplePayConnect();
  const testMutation = useTestSimplePayConnection();
  const disconnectMutation = useSimplePayDisconnect();

  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  const handleConnect = async () => {
    setError('');
    setTestResult(null);
    try {
      await connectMutation.mutateAsync({ clientId, apiKey });
      setClientId('');
      setApiKey('');
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Please check your credentials.');
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync();
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : 'Connection test failed' });
    }
  };

  const handleDisconnect = async () => {
    if (confirm('Are you sure you want to disconnect SimplePay? Historical data will be preserved.')) {
      try {
        await disconnectMutation.mutateAsync();
        mutate();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to disconnect');
      }
    }
  };

  if (loadingStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Error state — don't show the connection form if we can't verify status
  if (isError && !status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            SimplePay Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              Unable to check connection status. Your connection may still be active.
              {statusError instanceof Error ? ` (${statusError.message})` : ''}
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => mutate()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Connected state
  if (status?.isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              SimplePay Connection
            </span>
            <Badge variant="default" className="flex items-center gap-1 bg-green-600">
              <CheckCircle className="w-3 h-3" />
              Connected
            </Badge>
          </CardTitle>
          <CardDescription>
            Your SimplePay account is connected and ready to sync employee data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Client ID:</span>
              <p className="font-medium font-mono">{status.clientId}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Last Sync:</span>
              <p className="font-medium">
                {status.lastSyncAt
                  ? formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true })
                  : 'Never'}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Employees Synced:</span>
              <p className="font-medium text-green-600">{status.employeesSynced}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Out of Sync:</span>
              <p className={`font-medium ${status.employeesOutOfSync > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                {status.employeesOutOfSync}
              </p>
            </div>
          </div>

          {status.syncErrorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{status.syncErrorMessage}</AlertDescription>
            </Alert>
          )}

          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              <AlertDescription className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {testResult.message || (testResult.success ? 'Connection successful' : 'Connection failed')}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2Off className="w-4 h-4 mr-2" />
              )}
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Disconnected state - show connection form
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          Connect to SimplePay
        </CardTitle>
        <CardDescription>
          Enter your SimplePay API credentials to enable payroll integration.
          You can find your API key in SimplePay under Settings &rarr; API Access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Your SimplePay Client ID"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Your SimplePay API Key"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Your API key will be encrypted and stored securely.
            </p>
          </div>
        </div>

        <Button
          onClick={handleConnect}
          disabled={!clientId || !apiKey || connectMutation.isPending}
          className="w-full"
        >
          {connectMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Link2 className="w-4 h-4 mr-2" />
          )}
          Connect to SimplePay
        </Button>

        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2">What this integration provides:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Sync employee data to SimplePay
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Import payslips from SimplePay
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Download IRP5 tax certificates
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Fetch EMP201 submission data
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
