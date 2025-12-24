export interface VAT201Data {
  period: string;
  outputVatCents: number;
  inputVatCents: number;
  netVatCents: number;
  standardRatedSalesCents: number;
  zeroRatedSalesCents: number;
  exemptSalesCents: number;
  standardRatedPurchasesCents: number;
  capitalGoodsCents: number;
  dueDate: string;
  isSubmitted: boolean;
  submittedAt?: string;
}

export interface VAT201Response {
  success: boolean;
  data: VAT201Data;
}
