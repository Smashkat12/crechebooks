/**
 * Xero MCP Server
 * Model Context Protocol server for Xero accounting integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { XeroClient } from 'xero-node';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { loadConfig, XeroMCPConfig } from './config';
import { TokenManager } from './auth/token-manager';
import { RateLimiter } from './utils/rate-limiter';
import { Logger } from './utils/logger';
import { XeroMCPError, handleXeroError } from './utils/error-handler';

// Import all tools
import {
  getAccounts,
  getTransactions,
  updateTransaction,
  createInvoice,
  getInvoices,
  applyPayment,
  getContacts,
  createContact,
} from './tools';

export class XeroMCPServer {
  private server: Server;
  private pool: Pool;
  private prisma: PrismaClient;
  private xeroClient: XeroClient;
  private tokenManager: TokenManager;
  private rateLimiter: RateLimiter;
  private logger: Logger;
  private config: XeroMCPConfig;

  constructor() {
    this.config = loadConfig();
    this.logger = new Logger('XeroMCP', this.config.logLevel);

    // Create PrismaClient with adapter (Prisma v7 requirement)
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    this.pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(this.pool);
    this.prisma = new PrismaClient({ adapter });

    this.server = new Server(
      {
        name: 'xero-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.xeroClient = new XeroClient({
      clientId: this.config.xeroClientId,
      clientSecret: this.config.xeroClientSecret,
      redirectUris: [this.config.xeroRedirectUri],
      scopes: [
        'openid',
        'profile',
        'email',
        'accounting.transactions',
        'accounting.contacts',
        'accounting.settings',
      ],
    });

    this.tokenManager = new TokenManager(this.prisma);
    this.rateLimiter = new RateLimiter(
      this.config.rateLimitRequests,
      this.config.rateLimitWindowMs,
    );

    this.registerTools();
    this.registerErrorHandler();
  }

  private registerTools(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        {
          name: 'get_accounts',
          description: 'Fetch Chart of Accounts from Xero',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'CrecheBooks tenant ID',
              },
            },
            required: ['tenantId'],
          },
        },
        {
          name: 'get_transactions',
          description: 'Fetch bank transactions from Xero',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'CrecheBooks tenant ID',
              },
              fromDate: {
                type: 'string',
                description: 'ISO date string (optional)',
              },
              toDate: {
                type: 'string',
                description: 'ISO date string (optional)',
              },
              bankAccount: {
                type: 'string',
                description: 'Bank account ID (optional)',
              },
            },
            required: ['tenantId'],
          },
        },
        {
          name: 'update_transaction',
          description: 'Update transaction category/account code in Xero',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'CrecheBooks tenant ID',
              },
              transactionId: {
                type: 'string',
                description: 'Xero transaction ID',
              },
              accountCode: { type: 'string', description: 'New account code' },
            },
            required: ['tenantId', 'transactionId', 'accountCode'],
          },
        },
        {
          name: 'create_invoice',
          description: 'Create a new invoice in Xero',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'CrecheBooks tenant ID',
              },
              contactId: { type: 'string', description: 'Xero contact ID' },
              lineItems: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    quantity: { type: 'number' },
                    unitAmountCents: { type: 'number' },
                    accountCode: { type: 'string' },
                    taxType: { type: 'string' },
                  },
                  required: [
                    'description',
                    'quantity',
                    'unitAmountCents',
                    'accountCode',
                  ],
                },
              },
              reference: {
                type: 'string',
                description: 'Invoice reference (optional)',
              },
              dueDate: { type: 'string', description: 'Due date ISO string' },
            },
            required: ['tenantId', 'contactId', 'lineItems', 'dueDate'],
          },
        },
        {
          name: 'get_invoices',
          description: 'Fetch invoices from Xero',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'CrecheBooks tenant ID',
              },
              status: {
                type: 'string',
                enum: ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED'],
              },
              fromDate: {
                type: 'string',
                description: 'ISO date string (optional)',
              },
              toDate: {
                type: 'string',
                description: 'ISO date string (optional)',
              },
            },
            required: ['tenantId'],
          },
        },
        {
          name: 'apply_payment',
          description: 'Apply a payment to an invoice in Xero',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'CrecheBooks tenant ID',
              },
              invoiceId: { type: 'string', description: 'Xero invoice ID' },
              amountCents: {
                type: 'number',
                description: 'Payment amount in cents',
              },
              paymentDate: {
                type: 'string',
                description: 'Payment date ISO string',
              },
              reference: {
                type: 'string',
                description: 'Payment reference (optional)',
              },
              bankAccountCode: {
                type: 'string',
                description: 'Bank account code',
              },
            },
            required: [
              'tenantId',
              'invoiceId',
              'amountCents',
              'paymentDate',
              'bankAccountCode',
            ],
          },
        },
        {
          name: 'get_contacts',
          description: 'Fetch contacts from Xero',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'CrecheBooks tenant ID',
              },
              isCustomer: {
                type: 'boolean',
                description: 'Filter by customer (optional)',
              },
              isSupplier: {
                type: 'boolean',
                description: 'Filter by supplier (optional)',
              },
            },
            required: ['tenantId'],
          },
        },
        {
          name: 'create_contact',
          description: 'Create a new contact in Xero',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'CrecheBooks tenant ID',
              },
              name: { type: 'string', description: 'Contact name' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              isCustomer: { type: 'boolean' },
              isSupplier: { type: 'boolean' },
            },
            required: ['tenantId', 'name'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handleToolCall(
        request.params.name,
        request.params.arguments as Record<string, unknown>,
      );
    });
  }

  private async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const startTime = Date.now();
    const tenantId = args.tenantId as string;

    try {
      // Rate limit check
      await this.rateLimiter.acquire();

      // Get fresh access token
      const accessToken = await this.tokenManager.getAccessToken(tenantId);
      const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

      // Set token on client
      this.xeroClient.setTokenSet({
        access_token: accessToken,
        token_type: 'Bearer',
      });

      this.logger.info(`Executing tool: ${name}`, { tenantId });

      let result: unknown;

      switch (name) {
        case 'get_accounts':
          result = await getAccounts(this.xeroClient, xeroTenantId);
          break;

        case 'get_transactions':
          result = await getTransactions(this.xeroClient, xeroTenantId, {
            fromDate: args.fromDate as string | undefined,
            toDate: args.toDate as string | undefined,
            bankAccount: args.bankAccount as string | undefined,
          });
          break;

        case 'update_transaction':
          result = await updateTransaction(
            this.xeroClient,
            xeroTenantId,
            args.transactionId as string,
            args.accountCode as string,
          );
          break;

        case 'create_invoice':
          result = await createInvoice(this.xeroClient, xeroTenantId, {
            contactId: args.contactId as string,
            lineItems: args.lineItems as Array<{
              description: string;
              quantity: number;
              unitAmountCents: number;
              accountCode: string;
              taxType?: string;
            }>,
            reference: args.reference as string | undefined,
            dueDate: args.dueDate as string,
          });
          break;

        case 'get_invoices':
          result = await getInvoices(this.xeroClient, xeroTenantId, {
            status: args.status as
              | 'DRAFT'
              | 'SUBMITTED'
              | 'AUTHORISED'
              | 'PAID'
              | 'VOIDED'
              | undefined,
            fromDate: args.fromDate as string | undefined,
            toDate: args.toDate as string | undefined,
          });
          break;

        case 'apply_payment':
          result = await applyPayment(this.xeroClient, xeroTenantId, {
            invoiceId: args.invoiceId as string,
            amountCents: args.amountCents as number,
            paymentDate: args.paymentDate as string,
            reference: args.reference as string | undefined,
            bankAccountCode: args.bankAccountCode as string,
          });
          break;

        case 'get_contacts':
          result = await getContacts(this.xeroClient, xeroTenantId, {
            isCustomer: args.isCustomer as boolean | undefined,
            isSupplier: args.isSupplier as boolean | undefined,
          });
          break;

        case 'create_contact':
          result = await createContact(this.xeroClient, xeroTenantId, {
            name: args.name as string,
            firstName: args.firstName as string | undefined,
            lastName: args.lastName as string | undefined,
            email: args.email as string | undefined,
            phone: args.phone as string | undefined,
            isCustomer: args.isCustomer as boolean | undefined,
            isSupplier: args.isSupplier as boolean | undefined,
          });
          break;

        default:
          throw new XeroMCPError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL', 400);
      }

      this.logger.info(`Tool ${name} completed`, {
        tenantId,
        durationMs: Date.now() - startTime,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.logError(
        error instanceof Error ? error : new Error(String(error)),
        { tool: name, tenantId, durationMs: Date.now() - startTime },
      );

      if (error instanceof XeroMCPError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                code: error.code,
                message: error.message,
                statusCode: error.statusCode,
              }),
            },
          ],
        };
      }

      handleXeroError(error);
    }
  }

  private registerErrorHandler(): void {
    this.server.onerror = (error) => {
      this.logger.logError(error);
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('Xero MCP Server started');
  }
}

// Main entry point
if (require.main === module) {
  const server = new XeroMCPServer();
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
