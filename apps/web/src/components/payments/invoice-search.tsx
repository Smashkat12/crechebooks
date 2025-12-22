/**
 * Invoice Search Component
 *
 * Search for invoices by parent name, child name, or invoice number
 */

import * as React from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useInvoicesList } from '@/hooks/use-invoices';
import { InvoiceStatus } from '@crechebooks/types';
import { useDebounce } from '@/hooks/use-debounce';

interface InvoiceSearchProps {
  tenantId: string;
  selectedInvoiceId?: string;
  onSelectInvoice: (invoiceId: string) => void;
  excludeStatus?: InvoiceStatus[];
}

export function InvoiceSearch({
  tenantId,
  selectedInvoiceId,
  onSelectInvoice,
  excludeStatus = [InvoiceStatus.PAID, InvoiceStatus.VOID],
}: InvoiceSearchProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data, isLoading } = useInvoicesList({
    tenantId,
    search: debouncedSearch,
    limit: 10,
  });

  const filteredInvoices = React.useMemo(() => {
    if (!data?.invoices) return [];
    return data.invoices.filter(
      (invoice) => !excludeStatus.includes(invoice.status)
    );
  }, [data?.invoices, excludeStatus]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by parent name, child name, or invoice number..."
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {isLoading && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="max-h-[400px] overflow-y-auto space-y-2">
        {filteredInvoices.length === 0 && debouncedSearch && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No invoices found matching &quot;{debouncedSearch}&quot;</p>
          </div>
        )}

        {filteredInvoices.length === 0 && !debouncedSearch && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Start typing to search for invoices</p>
          </div>
        )}

        {filteredInvoices.map((invoice) => {
          const isSelected = selectedInvoiceId === invoice.id;

          return (
            <Card
              key={invoice.id}
              className={`cursor-pointer transition-colors hover:border-primary ${
                isSelected ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() => onSelectInvoice(invoice.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{invoice.invoiceNumber}</h4>
                      <Badge variant="outline">{invoice.status}</Badge>
                    </div>

                    <div className="text-sm text-muted-foreground space-y-0.5">
                      <p>Parent ID: {invoice.parentId}</p>
                      <p>Due: {formatDate(invoice.dueDate)}</p>
                      <p className="font-medium text-foreground">
                        Amount Due: {formatCurrency(invoice.amountDue)}
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                  >
                    {isSelected ? 'Selected' : 'Select'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
