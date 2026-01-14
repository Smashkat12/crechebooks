'use client';

/**
 * Asset Returns Component
 * TASK-STAFF-002: Track asset returns during offboarding
 *
 * Displays and manages the return status of company assets
 * assigned to offboarding staff members.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
  Save,
} from 'lucide-react';
import {
  useAssetReturns,
  useUpdateAssetReturn,
  type AssetReturn,
} from '@/hooks/use-staff-offboarding';
import { formatDate } from '@/lib/utils';

interface AssetReturnsProps {
  staffId: string;
  offboardingId: string;
}

const ASSET_STATUSES = [
  { value: 'PENDING', label: 'Pending', icon: Clock, color: 'text-yellow-500' },
  { value: 'RETURNED', label: 'Returned', icon: CheckCircle, color: 'text-green-500' },
  { value: 'DAMAGED', label: 'Damaged', icon: AlertCircle, color: 'text-orange-500' },
  { value: 'NOT_RETURNED', label: 'Not Returned', icon: XCircle, color: 'text-red-500' },
] as const;

function getStatusConfig(status: AssetReturn['returnStatus']) {
  return (
    ASSET_STATUSES.find((s) => s.value === status) || {
      value: status,
      label: status,
      icon: Clock,
      color: 'text-gray-500',
    }
  );
}

interface AssetRowProps {
  asset: AssetReturn;
  staffId: string;
  offboardingId: string;
  onUpdate: () => void;
}

function AssetRow({ asset, staffId, offboardingId, onUpdate }: AssetRowProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(asset.notes || '');

  const { mutate: updateAsset, isPending: updating } = useUpdateAssetReturn(staffId, offboardingId);

  const statusConfig = getStatusConfig(asset.returnStatus);
  const StatusIcon = statusConfig.icon;

  const handleStatusChange = (newStatus: string) => {
    updateAsset(
      { assetId: asset.id, status: newStatus },
      { onSuccess: onUpdate }
    );
  };

  const handleSaveNotes = () => {
    updateAsset(
      { assetId: asset.id, status: asset.returnStatus, notes },
      {
        onSuccess: () => {
          setEditingNotes(false);
          onUpdate();
        },
      }
    );
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{asset.assetName}</TableCell>
      <TableCell>
        <Badge variant="outline" className="font-normal">
          {asset.assetType}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {asset.serialNumber || '-'}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
          <span className="text-sm">{statusConfig.label}</span>
        </div>
        {asset.returnedAt && (
          <span className="text-xs text-muted-foreground">
            {formatDate(asset.returnedAt)}
          </span>
        )}
      </TableCell>
      <TableCell>
        <Select
          value={asset.returnStatus}
          onValueChange={handleStatusChange}
          disabled={updating}
        >
          <SelectTrigger className="w-36">
            {updating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            {ASSET_STATUSES.map((s) => {
              const Icon = s.icon;
              return (
                <SelectItem key={s.value} value={s.value}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3 w-3 ${s.color}`} />
                    {s.label}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {editingNotes ? (
          <div className="flex items-center gap-2">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              className="w-40"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSaveNotes}
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setEditingNotes(true)}
          >
            {asset.notes || 'Add notes'}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function AssetReturns({ staffId, offboardingId }: AssetReturnsProps) {
  const { data: assets, isLoading, refetch } = useAssetReturns(staffId, offboardingId);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Asset Returns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // No assets assigned
  if (!assets?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Asset Returns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No assets assigned to this staff member.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Summary counts
  const statusCounts = assets.reduce(
    (acc, asset) => {
      acc[asset.returnStatus] = (acc[asset.returnStatus] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const allReturned = statusCounts['RETURNED'] === assets.length;
  const pendingCount = statusCounts['PENDING'] || 0;
  const notReturnedCount = statusCounts['NOT_RETURNED'] || 0;
  const damagedCount = statusCounts['DAMAGED'] || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Asset Returns
          </CardTitle>
          <div className="flex items-center gap-2">
            {allReturned ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                <CheckCircle className="mr-1 h-3 w-3" />
                All Returned
              </Badge>
            ) : (
              <>
                {pendingCount > 0 && (
                  <Badge variant="outline" className="bg-yellow-50">
                    {pendingCount} Pending
                  </Badge>
                )}
                {notReturnedCount > 0 && (
                  <Badge variant="destructive">
                    {notReturnedCount} Not Returned
                  </Badge>
                )}
                {damagedCount > 0 && (
                  <Badge variant="outline" className="bg-orange-50 text-orange-800">
                    {damagedCount} Damaged
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Serial #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Update</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  staffId={staffId}
                  offboardingId={offboardingId}
                  onUpdate={() => refetch()}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
