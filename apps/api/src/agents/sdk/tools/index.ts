/**
 * Agent Tools barrel exports.
 *
 * Public surface for the tool registry that replaces the decorative string
 * tools previously declared on {@link SdkAgentFactory}.
 */

export {
  AgentToolError,
  type AgentTool,
  type AgentToolContext,
  type AgentToolInputSchema,
  type AgentToolResult,
} from './interfaces/agent-tool.interface';

export {
  AgentToolRegistry,
  type AnthropicToolDefinition,
} from './tool-registry.service';

// Individual tool re-exports (useful for unit tests).
export { listInvoicesTool } from './read/list-invoices.tool';
export { listPaymentsTool } from './read/list-payments.tool';
export { listTransactionsTool } from './read/list-transactions.tool';
export { getArrearsSummaryTool } from './read/get-arrears-summary.tool';
export { getDashboardMetricsTool } from './read/get-dashboard-metrics.tool';
export { listChildrenTool } from './read/list-children.tool';
export { listParentsTool } from './read/list-parents.tool';
export { listStaffTool } from './read/list-staff.tool';
export { getTenantTool } from './read/get-tenant.tool';
export { generateInvoicesTool } from './mutation/generate-invoices.tool';
export { allocatePaymentTool } from './mutation/allocate-payment.tool';
export { runPaymentMatchingTool } from './mutation/run-payment-matching.tool';
export { categorizeTransactionsTool } from './mutation/categorize-transactions.tool';
