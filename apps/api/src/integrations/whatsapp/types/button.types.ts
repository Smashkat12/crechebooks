/**
 * Button Response Types
 * TASK-WA-009: Interactive Button Response Handlers
 *
 * Types and utilities for parsing WhatsApp quick reply button payloads.
 * Button IDs follow the pattern: action_referenceId (e.g., pay_INV-2026-001234)
 */

/**
 * Button actions supported by the CrecheBooks WhatsApp integration
 *
 * - pay: Parent wants to pay now
 * - extension: Parent requests payment extension
 * - contact: Parent wants to contact the creche
 * - paid: Parent indicates they have already paid
 * - help: Parent requests help/menu
 * - plan: Parent requests payment plan
 * - callback: Parent requests a callback
 * - view: Parent wants to view invoice/document (triggers PDF send in session)
 */
export type ButtonAction =
  | 'pay'
  | 'extension'
  | 'contact'
  | 'paid'
  | 'help'
  | 'plan'
  | 'callback'
  | 'view';

/**
 * All valid button actions as a readonly array
 */
export const VALID_BUTTON_ACTIONS: readonly ButtonAction[] = [
  'pay',
  'extension',
  'contact',
  'paid',
  'help',
  'plan',
  'callback',
  'view',
] as const;

/**
 * Parsed button payload from WhatsApp quick reply
 */
export interface ParsedButtonPayload {
  /** The action type (e.g., 'pay', 'extension') */
  action: ButtonAction;
  /** The reference ID (e.g., invoice number: 'INV-2026-001234') */
  referenceId: string;
  /** The original raw payload string */
  rawPayload: string;
}

/**
 * Result of button payload parsing
 */
export interface ButtonPayloadParseResult {
  success: boolean;
  payload?: ParsedButtonPayload;
  error?: string;
}

/**
 * Button response handler context
 */
export interface ButtonResponseContext {
  /** Recipient phone number in E.164 format */
  from: string;
  /** Tenant ID for the creche */
  tenantId: string;
  /** Parsed button payload */
  payload: ParsedButtonPayload;
  /** Optional user ID if authenticated */
  userId?: string;
}

/**
 * Check if a string is a valid button action
 */
export function isValidButtonAction(action: string): action is ButtonAction {
  return VALID_BUTTON_ACTIONS.includes(action as ButtonAction);
}

/**
 * Parse a button payload string into its components
 *
 * Button payloads follow the format: action_referenceId
 * Examples:
 * - pay_INV-2026-001234
 * - extension_INV-2026-001234
 * - contact_INV-2026-001234
 *
 * @param payload - The raw button payload string
 * @returns ParsedButtonPayload with action and referenceId
 */
export function parseButtonPayload(payload: string): ButtonPayloadParseResult {
  if (!payload || typeof payload !== 'string') {
    return {
      success: false,
      error: 'Invalid payload: empty or not a string',
    };
  }

  // Split on first underscore only to handle reference IDs with underscores
  const underscoreIndex = payload.indexOf('_');

  if (underscoreIndex === -1) {
    return {
      success: false,
      error: `Invalid payload format: missing underscore separator in "${payload}"`,
    };
  }

  const action = payload.substring(0, underscoreIndex);
  const referenceId = payload.substring(underscoreIndex + 1);

  if (!action || !referenceId) {
    return {
      success: false,
      error: `Invalid payload format: missing action or reference ID in "${payload}"`,
    };
  }

  if (!isValidButtonAction(action)) {
    return {
      success: false,
      error: `Unknown button action: "${action}"`,
    };
  }

  return {
    success: true,
    payload: {
      action,
      referenceId,
      rawPayload: payload,
    },
  };
}

/**
 * Create a button payload string from components
 *
 * @param action - The button action
 * @param referenceId - The reference ID (e.g., invoice number)
 * @returns Formatted button payload string
 */
export function createButtonPayload(
  action: ButtonAction,
  referenceId: string,
): string {
  return `${action}_${referenceId}`;
}
