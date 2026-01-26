/**
 * CrecheBooks MCP Service
 * TASK-SDK-002: CrecheBooks In-Process MCP Server (Data Access Tools)
 *
 * In-process MCP server that provides read-only data access tools
 * for the AI agent orchestrator. All tools enforce tenant isolation.
 *
 * Architecture:
 * - Receives PrismaService and optional RuvectorService via DI
 * - Holds all tool definitions in a Map
 * - Provides executeTool(), listTools(), getToolDefinitions()
 * - Registers 5 core tools + optional search_similar_transactions when ruvector is available
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
import {
  getPatterns,
  getHistory,
  getInvoices,
  queryTransactions,
  getReports,
  searchSimilarTransactions,
} from './tools/index';
import type { McpToolDefinition, McpToolResult } from './types/index';

/** Metadata about the MCP server */
export interface McpServerInfo {
  name: string;
  version: string;
  toolCount: number;
  ruvectorAvailable: boolean;
}

@Injectable()
export class CrecheBooksMcpService implements OnModuleInit {
  private readonly logger = new Logger(CrecheBooksMcpService.name);
  private readonly tools: Map<string, McpToolDefinition> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
  ) {}

  onModuleInit(): void {
    this.registerCoreTools();
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
  private registerTool(tool: McpToolDefinition): void {
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
      version: '1.0.0',
      toolCount: this.tools.size,
      ruvectorAvailable: this.ruvector?.isAvailable() ?? false,
    };
  }
}
