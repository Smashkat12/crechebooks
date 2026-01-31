'use client';

import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  Shield,
  Clock,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useRotateApiKey,
  SCOPE_GROUPS,
  type ApiKey,
  type ApiKeyScope,
  type ApiKeyWithSecret,
} from '@/hooks/use-api-keys';

export default function ApiKeysPage() {
  const { toast } = useToast();
  const [showRevoked, setShowRevoked] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [newKey, setNewKey] = useState<ApiKeyWithSecret | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const { data: apiKeys, isLoading, error } = useApiKeys({ includeRevoked: showRevoked });
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();
  const rotateMutation = useRotateApiKey();

  const handleCopySecret = async () => {
    if (newKey?.secretKey) {
      await navigator.clipboard.writeText(newKey.secretKey);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
      toast({ title: 'API key copied to clipboard' });
    }
  };

  const handleRevoke = async () => {
    if (!selectedKey) return;
    try {
      await revokeMutation.mutateAsync(selectedKey.id);
      toast({ title: 'API key revoked', description: `"${selectedKey.name}" has been revoked.` });
      setRevokeDialogOpen(false);
      setSelectedKey(null);
    } catch {
      toast({ title: 'Failed to revoke API key', variant: 'destructive' });
    }
  };

  const handleRotate = async () => {
    if (!selectedKey) return;
    try {
      const rotatedKey = await rotateMutation.mutateAsync(selectedKey.id);
      setNewKey(rotatedKey);
      setRotateDialogOpen(false);
      setSecretDialogOpen(true);
      toast({
        title: 'API key rotated',
        description: 'The old key has been revoked. Save the new secret now.',
      });
    } catch {
      toast({ title: 'Failed to rotate API key', variant: 'destructive' });
    }
  };

  const getStatusBadge = (key: ApiKey) => {
    if (key.revokedAt) {
      return <Badge variant="destructive">Revoked</Badge>;
    }
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (key.expiresAt) {
      const daysUntilExpiry = Math.ceil(
        (new Date(key.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilExpiry <= 7) {
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Expires soon</Badge>;
      }
    }
    return <Badge variant="default" className="bg-green-600">Active</Badge>;
  };

  const getEnvironmentBadge = (env: string) => {
    const variants: Record<string, string> = {
      production: 'bg-blue-100 text-blue-800',
      staging: 'bg-yellow-100 text-yellow-800',
      local: 'bg-gray-100 text-gray-800',
    };
    return (
      <Badge variant="outline" className={variants[env] || variants.local}>
        {env}
      </Badge>
    );
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Failed to load API keys. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
          <p className="text-muted-foreground">
            Manage API keys for CLI, integrations, and programmatic access.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Your API Keys
              </CardTitle>
              <CardDescription>
                API keys provide programmatic access to CrecheBooks. Keep them secure.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showRevoked"
                checked={showRevoked}
                onCheckedChange={(checked) => setShowRevoked(checked === true)}
              />
              <Label htmlFor="showRevoked" className="text-sm cursor-pointer">
                Show revoked keys
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !apiKeys?.length ? (
            <div className="text-center py-12">
              <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No API keys yet</h3>
              <p className="text-muted-foreground mb-4">
                Create an API key to access CrecheBooks via CLI or integrations.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first API key
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id} className={key.revokedAt ? 'opacity-50' : ''}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{key.name}</div>
                        {key.description && (
                          <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {key.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {key.keyPrefix}...
                      </code>
                    </TableCell>
                    <TableCell>{getEnvironmentBadge(key.environment)}</TableCell>
                    <TableCell>{getStatusBadge(key)}</TableCell>
                    <TableCell>
                      {key.lastUsedAt ? (
                        <div className="text-sm">
                          <div>{formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}</div>
                          {key.lastUsedIp && (
                            <div className="text-muted-foreground flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {key.lastUsedIp}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {format(new Date(key.createdAt), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {!key.revokedAt && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedKey(key);
                              setRotateDialogOpen(true);
                            }}
                            disabled={rotateMutation.isPending}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedKey(key);
                              setRevokeDialogOpen(true);
                            }}
                            disabled={revokeMutation.isPending}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Dialog */}
      <CreateApiKeyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(key) => {
          setNewKey(key);
          setCreateDialogOpen(false);
          setSecretDialogOpen(true);
        }}
        mutation={createMutation}
      />

      {/* Secret Display Dialog */}
      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy your API key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This is the only time you&apos;ll see this secret. Store it securely.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    readOnly
                    type={showSecret ? 'text' : 'password'}
                    value={newKey?.secretKey || ''}
                    className="pr-10 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button onClick={handleCopySecret} variant="outline">
                  {copiedSecret ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm">Usage Example</h4>
              <pre className="text-xs overflow-x-auto">
                <code>{`curl -H "X-API-Key: ${newKey?.secretKey || 'cb_prod_...'}" \\
  ${process.env.NEXT_PUBLIC_API_URL || 'https://api.crechebooks.co.za'}/api/v1/invoices`}</code>
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setSecretDialogOpen(false);
                setNewKey(null);
                setShowSecret(false);
              }}
            >
              I&apos;ve saved my key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke &quot;{selectedKey?.name}&quot;? This action cannot
              be undone and any applications using this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedKey(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? 'Revoking...' : 'Revoke Key'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rotate Confirmation Dialog */}
      <AlertDialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke &quot;{selectedKey?.name}&quot; and create a new key with the same
              settings. You&apos;ll need to update your applications with the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedKey(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotate} disabled={rotateMutation.isPending}>
              {rotateMutation.isPending ? 'Rotating...' : 'Rotate Key'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Create API Key Dialog Component
interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: ApiKeyWithSecret) => void;
  mutation: ReturnType<typeof useCreateApiKey>;
}

function CreateApiKeyDialog({ open, onOpenChange, onCreated, mutation }: CreateApiKeyDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'staging' | 'local'>('production');
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [selectedScopes, setSelectedScopes] = useState<Set<ApiKeyScope>>(new Set(['FULL_ACCESS']));
  const [useFullAccess, setUseFullAccess] = useState(true);

  const handleScopeChange = (scope: ApiKeyScope, checked: boolean) => {
    const newScopes = new Set(selectedScopes);
    if (checked) {
      newScopes.add(scope);
    } else {
      newScopes.delete(scope);
    }
    setSelectedScopes(newScopes);
  };

  const handleFullAccessChange = (checked: boolean) => {
    setUseFullAccess(checked);
    if (checked) {
      setSelectedScopes(new Set(['FULL_ACCESS']));
    } else {
      setSelectedScopes(new Set());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (selectedScopes.size === 0) {
      toast({ title: 'Select at least one scope', variant: 'destructive' });
      return;
    }

    try {
      const key = await mutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        environment,
        scopes: Array.from(selectedScopes),
        expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : undefined,
      });
      onCreated(key);
      // Reset form
      setName('');
      setDescription('');
      setEnvironment('production');
      setExpiresInDays('');
      setSelectedScopes(new Set(['FULL_ACCESS']));
      setUseFullAccess(true);
    } catch {
      toast({ title: 'Failed to create API key', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for CLI access or integrations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Production CLI, CI/CD Pipeline"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="environment">Environment</Label>
                <Select value={environment} onValueChange={(v) => setEnvironment(v as typeof environment)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="local">Local Development</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional notes about this key's purpose"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry">Expiration</Label>
              <div className="flex items-center gap-2">
                <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Never expires" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Never expires</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {expiresInDays
                    ? `Expires ${format(new Date(Date.now() + parseInt(expiresInDays, 10) * 24 * 60 * 60 * 1000), 'MMM d, yyyy')}`
                    : 'No expiration'}
                </div>
              </div>
            </div>

            {/* Scopes */}
            <div className="space-y-4">
              <div>
                <Label className="text-base">Permissions</Label>
                <p className="text-sm text-muted-foreground">
                  Select the access level for this API key.
                </p>
              </div>

              <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/50">
                <Checkbox
                  id="fullAccess"
                  checked={useFullAccess}
                  onCheckedChange={(checked) => handleFullAccessChange(checked === true)}
                />
                <div className="flex-1">
                  <Label htmlFor="fullAccess" className="cursor-pointer font-medium">
                    Full Access
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Grant all permissions (recommended for CLI usage)
                  </p>
                </div>
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>

              {!useFullAccess && (
                <div className="space-y-4 pt-2">
                  {Object.entries(SCOPE_GROUPS).map(([groupKey, group]) => (
                    <div key={groupKey} className="space-y-2">
                      <div>
                        <h4 className="font-medium text-sm">{group.label}</h4>
                        <p className="text-xs text-muted-foreground">{group.description}</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {group.scopes.map((scope) => (
                          <div
                            key={scope.value}
                            className="flex items-center space-x-2 p-2 border rounded"
                          >
                            <Checkbox
                              id={scope.value}
                              checked={selectedScopes.has(scope.value as ApiKeyScope)}
                              onCheckedChange={(checked) =>
                                handleScopeChange(scope.value as ApiKeyScope, checked === true)
                              }
                            />
                            <Label htmlFor={scope.value} className="text-sm cursor-pointer">
                              {scope.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating...' : 'Create API Key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
