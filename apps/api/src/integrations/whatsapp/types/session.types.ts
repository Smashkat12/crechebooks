/**
 * Session Interactive Types
 * TASK-WA-010: Session-Based Interactive Features
 *
 * Types and utilities for parsing WhatsApp list picker and quick reply responses.
 * List picker IDs follow the pattern: type_value (e.g., statement_current, help_balance)
 */

/**
 * List picker types supported by the CrecheBooks WhatsApp integration
 *
 * - statement_period: Statement period selection (current, prev, 3mo, ytd, tax)
 * - invoice_list: Invoice selection from unpaid invoices
 * - help_menu: Help menu topic selection
 */
export type ListPickerType = 'statement' | 'invoice' | 'help';

/**
 * All valid list picker types as a readonly array
 */
export const VALID_LIST_PICKER_TYPES: readonly ListPickerType[] = [
  'statement',
  'invoice',
  'help',
] as const;

/**
 * Statement period identifiers
 */
export type StatementPeriod = 'current' | 'prev' | '3mo' | 'ytd' | 'tax';

/**
 * Help menu option identifiers
 */
export type HelpMenuOption =
  | 'balance'
  | 'payment'
  | 'statement'
  | 'update'
  | 'human';

/**
 * Quick reply menu actions from balance inquiry
 */
export type BalanceMenuAction = 'pay' | 'invoices' | 'statement';

/**
 * Parsed list picker response
 */
export interface ParsedListResponse {
  /** The list picker type (e.g., 'statement', 'invoice', 'help') */
  type: ListPickerType;
  /** The selected value (e.g., 'current', invoice ID, 'balance') */
  value: string;
  /** The original raw list ID string */
  rawListId: string;
}

/**
 * Result of list response parsing
 */
export interface ListResponseParseResult {
  success: boolean;
  parsed?: ParsedListResponse;
  error?: string;
}

/**
 * Session interactive handler context
 */
export interface SessionInteractiveContext {
  /** Recipient phone number in E.164 format */
  from: string;
  /** Tenant ID for the creche */
  tenantId: string;
  /** Parent ID if known */
  parentId?: string;
  /** Parsed list response */
  listResponse?: ParsedListResponse;
}

/**
 * Check if a string is a valid list picker type
 */
export function isValidListPickerType(type: string): type is ListPickerType {
  return VALID_LIST_PICKER_TYPES.includes(type as ListPickerType);
}

/**
 * Parse a list picker ID into its components
 *
 * List IDs follow the format: type_value
 * Examples:
 * - statement_current -> { type: 'statement', value: 'current' }
 * - statement_3mo -> { type: 'statement', value: '3mo' }
 * - invoice_abc-123 -> { type: 'invoice', value: 'abc-123' }
 * - help_balance -> { type: 'help', value: 'balance' }
 *
 * @param listId - The raw list picker ID string
 * @returns ParsedListResponse with type and value
 */
export function parseListResponse(listId: string): ListResponseParseResult {
  if (!listId || typeof listId !== 'string') {
    return {
      success: false,
      error: 'Invalid list ID: empty or not a string',
    };
  }

  // Split on first underscore only to handle values with underscores
  const underscoreIndex = listId.indexOf('_');

  if (underscoreIndex === -1) {
    return {
      success: false,
      error: `Invalid list ID format: missing underscore separator in "${listId}"`,
    };
  }

  const type = listId.substring(0, underscoreIndex);
  const value = listId.substring(underscoreIndex + 1);

  if (!type || !value) {
    return {
      success: false,
      error: `Invalid list ID format: missing type or value in "${listId}"`,
    };
  }

  if (!isValidListPickerType(type)) {
    return {
      success: false,
      error: `Unknown list picker type: "${type}"`,
    };
  }

  return {
    success: true,
    parsed: {
      type,
      value,
      rawListId: listId,
    },
  };
}

/**
 * Create a list picker ID from type and value
 *
 * @param type - The list picker type
 * @param value - The value identifier
 * @returns Formatted list ID string
 */
export function createListId(type: ListPickerType, value: string): string {
  return `${type}_${value}`;
}

/**
 * Parse a quick reply menu action ID
 * Menu action IDs follow the format: menu_action
 * Examples:
 * - menu_pay -> 'pay'
 * - menu_invoices -> 'invoices'
 * - menu_statement -> 'statement'
 */
export function parseMenuAction(buttonId: string): BalanceMenuAction | null {
  if (!buttonId || !buttonId.startsWith('menu_')) {
    return null;
  }
  const action = buttonId.substring(5) as BalanceMenuAction;
  const validActions: BalanceMenuAction[] = ['pay', 'invoices', 'statement'];
  return validActions.includes(action) ? action : null;
}
