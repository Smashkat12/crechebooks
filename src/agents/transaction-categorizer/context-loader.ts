/**
 * Context Loader for Transaction Categorizer Agent
 * TASK-AGENT-002: Transaction Categorizer Agent
 *
 * @module agents/transaction-categorizer/context-loader
 * @description Loads agent context from .claude/context/ JSON files.
 * Fails fast if context files are missing or invalid.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  PayeePattern,
  ChartOfAccountsEntry,
  AgentContext,
} from './interfaces/categorizer.interface';

interface PayeePatternsFile {
  version: string;
  description: string;
  autoApplyConfidenceThreshold: number;
  patterns: PayeePattern[];
}

interface ChartOfAccountsFile {
  version: string;
  description: string;
  accounts: ChartOfAccountsEntry[];
  accountRanges: Record<string, { start: number; end: number }>;
}

@Injectable()
export class ContextLoader implements OnModuleInit {
  private readonly logger = new Logger(ContextLoader.name);
  private context: AgentContext | null = null;
  private readonly contextPath = path.join(process.cwd(), '.claude/context');

  async onModuleInit(): Promise<void> {
    await this.loadContext();
  }

  /**
   * Load context from JSON files
   * @throws Error if files are missing or invalid JSON
   */
  async loadContext(): Promise<AgentContext> {
    const patternsPath = path.join(this.contextPath, 'payee_patterns.json');
    const coaPath = path.join(this.contextPath, 'chart_of_accounts.json');

    this.logger.log(`Loading context from ${this.contextPath}`);

    // Check files exist - fail fast if not
    try {
      await fs.access(patternsPath);
    } catch {
      const error = new Error(
        `Context file not found: ${patternsPath}. Run TASK-AGENT-001 to create context files.`,
      );
      this.logger.error(error.message);
      throw error;
    }

    try {
      await fs.access(coaPath);
    } catch {
      const error = new Error(
        `Context file not found: ${coaPath}. Run TASK-AGENT-001 to create context files.`,
      );
      this.logger.error(error.message);
      throw error;
    }

    // Load and parse files - fail fast on invalid JSON
    let patternsRaw: string;
    let coaRaw: string;

    try {
      [patternsRaw, coaRaw] = await Promise.all([
        fs.readFile(patternsPath, 'utf-8'),
        fs.readFile(coaPath, 'utf-8'),
      ]);
    } catch (error) {
      const message = `Failed to read context files: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      throw new Error(message);
    }

    let patternsData: PayeePatternsFile;
    let coaData: ChartOfAccountsFile;

    try {
      patternsData = JSON.parse(patternsRaw) as PayeePatternsFile;
    } catch (error) {
      const message = `Invalid JSON in payee_patterns.json: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      throw new Error(message);
    }

    try {
      coaData = JSON.parse(coaRaw) as ChartOfAccountsFile;
    } catch (error) {
      const message = `Invalid JSON in chart_of_accounts.json: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      throw new Error(message);
    }

    // Validate required fields
    if (!Array.isArray(patternsData.patterns)) {
      throw new Error('payee_patterns.json missing "patterns" array');
    }

    if (typeof patternsData.autoApplyConfidenceThreshold !== 'number') {
      throw new Error(
        'payee_patterns.json missing "autoApplyConfidenceThreshold" number',
      );
    }

    if (!Array.isArray(coaData.accounts)) {
      throw new Error('chart_of_accounts.json missing "accounts" array');
    }

    // Build context
    this.context = {
      patterns: patternsData.patterns,
      chartOfAccounts: coaData.accounts,
      // Convert threshold from decimal (0.80) to percentage (80)
      autoApplyThreshold: patternsData.autoApplyConfidenceThreshold * 100,
    };

    this.logger.log(
      `Loaded ${this.context.patterns.length} patterns, ${this.context.chartOfAccounts.length} accounts, threshold: ${this.context.autoApplyThreshold}%`,
    );

    return this.context;
  }

  /**
   * Get loaded context
   * @throws Error if context not loaded
   */
  getContext(): AgentContext {
    if (!this.context) {
      throw new Error(
        'Context not loaded. Ensure ContextLoader.onModuleInit() completed successfully.',
      );
    }
    return this.context;
  }

  /**
   * Get pattern by account code
   */
  getPattern(accountCode: string): PayeePattern | undefined {
    return this.context?.patterns.find((p) => p.accountCode === accountCode);
  }

  /**
   * Get account by code
   */
  getAccount(code: string): ChartOfAccountsEntry | undefined {
    return this.context?.chartOfAccounts.find((a) => a.code === code);
  }

  /**
   * Validate account code exists in chart of accounts
   */
  isValidAccountCode(code: string): boolean {
    return this.context?.chartOfAccounts.some((a) => a.code === code) ?? false;
  }
}
