/**
 * Category Select Component
 *
 * Dropdown for selecting transaction categories from Xero Chart of Accounts.
 * Fetches accounts from API and groups by type (Revenue, Expense, etc.).
 */

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

interface XeroAccount {
  id: string;
  accountCode: string;
  name: string;
  type: string;
  status: string;
}

interface AccountsResponse {
  accounts: XeroAccount[];
  total: number;
}

// Account type groupings for display
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  REVENUE: 'Revenue',
  DIRECTCOSTS: 'Cost of Sales',
  EXPENSE: 'Expenses',
  OVERHEADS: 'Operating Expenses',
  OTHERINCOME: 'Other Income',
  OTHEREXPENSE: 'Other Expenses',
  CURRLIAB: 'Current Liabilities',
  LIABILITY: 'Liabilities',
  TERMLIAB: 'Long-term Liabilities',
  CURRENT: 'Current Assets',
  FIXED: 'Fixed Assets',
  INVENTORY: 'Inventory',
  NONCURRENT: 'Non-current Assets',
  PREPAYMENT: 'Prepayments',
  BANK: 'Bank Accounts',
  EQUITY: 'Equity',
  DEPRECIATN: 'Depreciation',
  PAYGLIABILITY: 'PAYG Liability',
  SUPERANNUATIONLIABILITY: 'Superannuation Liability',
  WAGESEXPENSE: 'Wages Expense',
  WAGESPAYABLELIABILITY: 'Wages Payable',
};

// Priority order for account types in dropdown
const TYPE_ORDER = [
  'REVENUE',
  'OTHERINCOME',
  'DIRECTCOSTS',
  'EXPENSE',
  'OVERHEADS',
  'OTHEREXPENSE',
  'CURRENT',
  'BANK',
  'FIXED',
  'INVENTORY',
  'NONCURRENT',
  'PREPAYMENT',
  'CURRLIAB',
  'LIABILITY',
  'TERMLIAB',
  'EQUITY',
  'DEPRECIATN',
  'PAYGLIABILITY',
  'SUPERANNUATIONLIABILITY',
  'WAGESEXPENSE',
  'WAGESPAYABLELIABILITY',
];

interface CategorySelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function CategorySelect({
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Select category...',
}: CategorySelectProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  // Fetch accounts from API
  const { data, isLoading, error } = useQuery<AccountsResponse>({
    queryKey: ['xero-accounts'],
    queryFn: async () => {
      const response = await apiClient.get<AccountsResponse>(endpoints.xero.accounts, {
        params: { limit: 500, status: 'ACTIVE' },
      });
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const accounts = data?.accounts ?? [];

  // Filter accounts by search query
  const filteredAccounts = React.useMemo(() => {
    if (!searchQuery) return accounts;

    const query = searchQuery.toLowerCase();
    return accounts.filter(
      (acc) =>
        acc.name.toLowerCase().includes(query) ||
        acc.accountCode.includes(query)
    );
  }, [accounts, searchQuery]);

  // Group accounts by type
  const groupedAccounts = React.useMemo(() => {
    const groups: Record<string, XeroAccount[]> = {};

    filteredAccounts.forEach((acc) => {
      const type = acc.type || 'OTHER';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(acc);
    });

    // Sort accounts within each group by code
    Object.keys(groups).forEach((type) => {
      groups[type].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    });

    return groups;
  }, [filteredAccounts]);

  // Get sorted type keys
  const sortedTypes = React.useMemo(() => {
    const types = Object.keys(groupedAccounts);
    return types.sort((a, b) => {
      const aIndex = TYPE_ORDER.indexOf(a);
      const bIndex = TYPE_ORDER.indexOf(b);
      // Types not in TYPE_ORDER go to the end
      const aOrder = aIndex === -1 ? 999 : aIndex;
      const bOrder = bIndex === -1 ? 999 : bIndex;
      return aOrder - bOrder;
    });
  }, [groupedAccounts]);

  // Find current value name for display
  const selectedAccount = accounts.find((acc) => acc.accountCode === value);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || isLoading}>
      <SelectTrigger className="w-full">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading accounts...</span>
          </div>
        ) : (
          <SelectValue placeholder={placeholder}>
            {selectedAccount ? `${selectedAccount.accountCode} - ${selectedAccount.name}` : placeholder}
          </SelectValue>
        )}
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        <div className="flex items-center border-b px-3 pb-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 border-0 p-0 focus-visible:ring-0"
          />
        </div>

        {error && (
          <div className="py-6 text-center text-sm text-destructive">
            Failed to load accounts
          </div>
        )}

        {!error && sortedTypes.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No accounts found' : 'No accounts available. Sync Chart of Accounts from Xero.'}
          </div>
        )}

        {sortedTypes.map((type) => (
          <SelectGroup key={type}>
            <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[type] || type}
            </SelectLabel>
            {groupedAccounts[type].map((account) => (
              <SelectItem key={account.id} value={account.accountCode}>
                {account.accountCode} - {account.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
