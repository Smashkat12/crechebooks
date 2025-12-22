export {
  ApiAllocationDto,
  ApiAllocatePaymentDto,
} from './allocate-payment.dto';
export {
  PaymentDto,
  AllocationResponseData,
  AllocatePaymentResponseDto,
  PaymentListItemDto,
  PaginationMeta,
  PaymentListResponseDto,
} from './payment-response.dto';
export { ListPaymentsQueryDto } from './list-payments.dto';

// TASK-PAY-032: Payment Matching DTOs
export { ApiMatchPaymentsDto } from './match-payments.dto';
export {
  ApiMatchedPaymentDto,
  ApiSuggestedMatchDto,
  ApiReviewRequiredDto,
  ApiMatchingSummaryDto,
  ApiMatchingResultDataDto,
  ApiMatchingResultResponseDto,
} from './matching-result.dto';

// TASK-PAY-033: Arrears Dashboard DTOs
export {
  ApiArrearsQueryDto,
  ApiAgingBucketsDto,
  ApiArrearsSummaryDto,
  ApiDebtorSummaryDto,
  ApiArrearsInvoiceDto,
  ApiArrearsReportDataDto,
  ApiArrearsReportResponseDto,
} from './arrears-report.dto';

// Re-export Prisma types for convenience
export { MatchType, MatchedBy } from '@prisma/client';
