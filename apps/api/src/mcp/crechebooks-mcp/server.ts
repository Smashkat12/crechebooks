/**
 * CrecheBooks MCP Service
 * TASK-SDK-002: CrecheBooks In-Process MCP Server (Data Access Tools)
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * In-process MCP server that provides data access and mutation tools
 * for the AI agent orchestrator. All tools enforce tenant isolation.
 *
 * Architecture:
 * - Receives PrismaService and optional services via DI
 * - Holds all tool definitions in a Map
 * - Provides executeTool(), listTools(), getToolDefinitions()
 * - Registers core read tools + mutation tools + optional tools
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RuvectorService } from '../../agents/sdk/ruvector.service';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { PaymentMatchingService } from '../../database/services/payment-matching.service';
import {
  getPatterns,
  getHistory,
  getInvoices,
  queryTransactions,
  getReports,
  searchSimilarTransactions,
} from './tools/index';
import {
  allocatePayment,
  generateInvoices,
  sendInvoices,
  matchPayments,
} from './tools/mutations/index';
import type { McpToolDefinition, McpToolResult } from './types/index';

/** Metadata about the MCP server */
export interface McpServerInfo {
  name: string;
  version: string;
  toolCount: number;
  ruvectorAvailable: boolean;
  mutationsEnabled: boolean;
}

@Injectable()
export class CrecheBooksMcpService implements OnModuleInit {
  private readonly logger = new Logger(CrecheBooksMcpService.name);

  private readonly tools: Map<string, McpToolDefinition<any, any>> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
    @Optional()
    @Inject(PaymentAllocationService)
    private readonly paymentAllocationService?: PaymentAllocationService,
    @Optional()
    @Inject(PaymentMatchingService)
    private readonly paymentMatchingService?: PaymentMatchingService,
  ) {}

  onModuleInit(): void {
    this.registerCoreTools();
    this.registerMutationTools();
    this.registerOptionalTools();
    this.logger.log(
      `CrecheBooks MCP server initialized with ${String(this.tools.size)} tools`,
    );
  }

  /**
   * Register the 5 core read-only data access tools.
   */
  private registerCoreTools(): void {
    this.registerTool(getPatterns(this.prisma));
    this.registerTool(getHistory(this.prisma));
    this.registerTool(getInvoices(this.prisma));
    this.registerTool(queryTransactions(this.prisma));
    this.registerTool(getReports(this.prisma));
  }

  /**
   * Register mutation tools for write operations.
   * TASK-SDK-003: CrecheBooks MCP Server Mutations
   */
  private registerMutationTools(): void {
    // Invoice mutations (use PrismaService directly)
    this.registerTool(generateInvoices(this.prisma));
    this.registerTool(sendInvoices(this.prisma));

    // Payment mutations
    if (this.paymentMatchingService) {
      this.registerTool(
        matchPayments(this.prisma, this.paymentMatchingService),
      );
      this.logger.log('Registered match_payments mutation tool');
    } else {
      this.logger.warn(
        'Skipped match_payments registration (PaymentMatchingService unavailable)',
      );
    }

    if (this.paymentAllocationService) {
      this.registerTool(
        allocatePayment(this.prisma, this.paymentAllocationService),
      );
      this.logger.log('Registered allocate_payment mutation tool');
    } else {
      this.logger.warn(
        'Skipped allocate_payment registration (PaymentAllocationService unavailable)',
      );
    }

    this.logger.log('Registered invoice and payment mutation tools');
  }

  /**
   * Register optional tools that depend on external services.
   * search_similar_transactions requires ruvector to be available.
   */
  private registerOptionalTools(): void {
    if (this.ruvector && this.ruvector.isAvailable()) {
      this.registerTool(searchSimilarTransactions(this.prisma, this.ruvector));
      this.logger.log(
        'Registered search_similar_transactions (ruvector available)',
      );
    } else {
      this.logger.log(
        'Skipped search_similar_transactions registration (ruvector unavailable)',
      );
    }
  }

  /**
   * Register a tool definition in the internal map.
   */

  private registerTool(tool: McpToolDefinition<any, any>): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(
        `Tool "${tool.name}" is already registered, overwriting`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Execute a tool by name with the given arguments.
   * @param name - The tool name (e.g., 'get_patterns')
   * @param args - The tool input arguments
   * @returns The tool result
   * @throws Error if the tool is not found
   */
  async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      const availableTools = this.listTools().join(', ');
      throw new Error(
        `Tool "${name}" not found. Available tools: ${availableTools}`,
      );
    }

    this.logger.debug(`Executing tool: ${name}`);
    const result = await tool.handler(args);
    return result as McpToolResult;
  }

  /**
   * List all registered tool names.
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tool definitions (for MCP protocol tool listing).
   */
  getToolDefinitions(): McpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if a specific tool is registered.
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get server metadata.
   */
  getServerInfo(): McpServerInfo {
    return {
      name: 'crechebooks-mcp',
      version: '1.1.0',
      toolCount: this.tools.size,
      ruvectorAvailable: this.ruvector?.isAvailable() ?? false,
      mutationsEnabled: true,
    };
  }
}
