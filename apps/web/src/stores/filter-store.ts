import { create } from 'zustand';

interface DateRange {
  from: Date | null;
  to: Date | null;
}

interface TransactionFilters {
  dateRange: DateRange;
  status: 'all' | 'categorized' | 'uncategorized' | 'needs_review';
  category: string | null;
  searchQuery: string;
}

interface InvoiceFilters {
  dateRange: DateRange;
  status: 'all' | 'draft' | 'pending' | 'sent' | 'paid' | 'overdue';
  parentId: string | null;
  searchQuery: string;
}

interface PaymentFilters {
  dateRange: DateRange;
  status: 'all' | 'unmatched' | 'matched' | 'partial';
  searchQuery: string;
}

interface FilterState {
  // Transaction filters
  transactionFilters: TransactionFilters;
  setTransactionFilters: (filters: Partial<TransactionFilters>) => void;
  resetTransactionFilters: () => void;

  // Invoice filters
  invoiceFilters: InvoiceFilters;
  setInvoiceFilters: (filters: Partial<InvoiceFilters>) => void;
  resetInvoiceFilters: () => void;

  // Payment filters
  paymentFilters: PaymentFilters;
  setPaymentFilters: (filters: Partial<PaymentFilters>) => void;
  resetPaymentFilters: () => void;
}

const defaultTransactionFilters: TransactionFilters = {
  dateRange: { from: null, to: null },
  status: 'all',
  category: null,
  searchQuery: '',
};

const defaultInvoiceFilters: InvoiceFilters = {
  dateRange: { from: null, to: null },
  status: 'all',
  parentId: null,
  searchQuery: '',
};

const defaultPaymentFilters: PaymentFilters = {
  dateRange: { from: null, to: null },
  status: 'all',
  searchQuery: '',
};

export const useFilterStore = create<FilterState>((set) => ({
  transactionFilters: defaultTransactionFilters,
  setTransactionFilters: (filters) =>
    set((state) => ({
      transactionFilters: { ...state.transactionFilters, ...filters },
    })),
  resetTransactionFilters: () => set({ transactionFilters: defaultTransactionFilters }),

  invoiceFilters: defaultInvoiceFilters,
  setInvoiceFilters: (filters) =>
    set((state) => ({
      invoiceFilters: { ...state.invoiceFilters, ...filters },
    })),
  resetInvoiceFilters: () => set({ invoiceFilters: defaultInvoiceFilters }),

  paymentFilters: defaultPaymentFilters,
  setPaymentFilters: (filters) =>
    set((state) => ({
      paymentFilters: { ...state.paymentFilters, ...filters },
    })),
  resetPaymentFilters: () => set({ paymentFilters: defaultPaymentFilters }),
}));
