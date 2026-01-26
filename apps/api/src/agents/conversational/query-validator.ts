/**
 * Query Validator
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module agents/conversational/query-validator
 * @description Validates and sanitizes user queries before processing.
 * Blocks dangerous keywords, enforces length limits, and ensures tenant context.
 *
 * CRITICAL RULES:
 * - Block SQL injection and mutation keywords
 * - Block credential-related keywords
 * - Enforce maximum query length
 * - Require tenant context
 */

import { Injectable } from '@nestjs/common';
import type { QueryValidationResult } from './interfaces/conversational.interface';

/** Maximum allowed question length in characters */
const MAX_QUESTION_LENGTH = 1000;

@Injectable()
export class QueryValidator {
  /**
   * Keywords that indicate potentially dangerous or out-of-scope queries.
   * Includes SQL mutation keywords and credential-related terms.
   */
  private readonly BLOCKED_KEYWORDS: string[] = [
    'delete',
    'drop',
    'truncate',
    'update',
    'insert',
    'alter',
    'password',
    'token',
    'secret',
    'api_key',
    'credential',
  ];

  /**
   * Validate a user's question before processing.
   * Checks for:
   * - Empty questions
   * - Missing tenantId
   * - Excessive length (>1000 chars)
   * - Blocked keywords (SQL injection, credential exposure)
   *
   * @param question - The user's raw question
   * @param tenantId - The tenant context (must be non-empty)
   * @returns Validation result with sanitized question if valid
   */
  validate(question: string, tenantId: string): QueryValidationResult {
    // Empty question check
    if (!question || question.trim().length === 0) {
      return {
        isValid: false,
        reason: 'Question cannot be empty.',
      };
    }

    // Tenant context check
    if (!tenantId || tenantId.trim().length === 0) {
      return {
        isValid: false,
        reason: 'Tenant context is required.',
      };
    }

    const trimmed = question.trim();

    // Max length check
    if (trimmed.length > MAX_QUESTION_LENGTH) {
      return {
        isValid: false,
        reason: `Question exceeds maximum length of ${String(MAX_QUESTION_LENGTH)} characters.`,
      };
    }

    // Blocked keyword check (case-insensitive)
    const lowerQuestion = trimmed.toLowerCase();
    for (const keyword of this.BLOCKED_KEYWORDS) {
      if (lowerQuestion.includes(keyword.toLowerCase())) {
        return {
          isValid: false,
          reason: `Query contains blocked keyword: "${keyword}". This agent only supports read-only financial queries.`,
        };
      }
    }

    return {
      isValid: true,
      sanitizedQuestion: trimmed,
    };
  }
}
