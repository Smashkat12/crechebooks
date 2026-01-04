/**
 * Transaction Components
 *
 * Public exports for transaction-related components
 */

export { TransactionTable } from './transaction-table';
export { TransactionFilters } from './transaction-filters';
export type { TransactionFiltersState } from './transaction-filters';
export { CategorizationDialog } from './categorization-dialog';
export { CategorySelect } from './category-select';
export { ConfidenceBadge } from './confidence-badge';
export { getTransactionColumns } from './transaction-columns';
export type { TransactionColumnOptions } from './transaction-columns';
export { SplitTransactionModal } from './SplitTransactionModal';
export { SplitRowInput } from './SplitRowInput';
export { SplitSummary } from './SplitSummary';
export type { SplitRow } from './SplitTransactionModal';

// Categorization Explainability Components
export { ConfidenceIndicator } from './ConfidenceIndicator';
export type { ConfidenceIndicatorProps } from './ConfidenceIndicator';
export { NeedsReviewBadge } from './NeedsReviewBadge';
export type { NeedsReviewBadgeProps } from './NeedsReviewBadge';
export { CategorizationReasoning } from './CategorizationReasoning';
export type { CategorizationReasoningProps } from './CategorizationReasoning';
export { AlternativeSuggestions } from './AlternativeSuggestions';
export type { AlternativeSuggestion, AlternativeSuggestionsProps } from './AlternativeSuggestions';
