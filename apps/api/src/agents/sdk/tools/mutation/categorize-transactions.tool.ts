/**
 * categorize_transactions tool
 *
 * Applies a chart-of-accounts categorization to a batch of bank transactions
 * for the current tenant. Preview-default. Writes a Categorization row per
 * transaction, updates transaction.status to CATEGORIZED, and audit-logs.
 *
 * Guardrails:
 *   - Every transaction MUST belong to ctx.tenantId. Cross-tenant ids fail with
 *     TENANT_MISMATCH.
 *   - VAT type is validated against the SA enum (STANDARD | ZERO_RATED |
 *     EXEMPT | NO_VAT).
 *   - source is fixed at AI_AUTO (agent-supplied) — user overrides come through
 *     a different endpoint.
 *   - NEVER contacts parents.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

const VALID_VAT = ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT'] as const;
type VatType = (typeof VALID_VAT)[number];

interface CategorizeTransactionsInput {
  transactionIds: string[];
  accountCode: string;
  accountName: string;
  vatType?: string;
  confidence?: number;
  reasoning?: string;
  confirm?: boolean;
}

export const categorizeTransactionsTool: AgentTool = {
  name: 'categorize_transactions',
  description:
    'Apply a chart-of-accounts categorisation to a batch of bank transactions. Preview-default: without confirm=true returns what would be written. Confirmed calls create Categorization rows + audit log.',
  mutation: true,
  inputSchema: {
    type: 'object',
    properties: {
      transactionIds: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 50,
        description: 'Transaction UUIDs to categorise (max 50).',
      },
      accountCode: {
        type: 'string',
        description: 'Chart-of-accounts code, e.g. "5100".',
      },
      accountName: {
        type: 'string',
        description: 'Human-readable account name.',
      },
      vatType: {
        type: 'string',
        enum: VALID_VAT as unknown as string[],
        description: 'SA VAT classification (default STANDARD).',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Confidence 0..100 (default 90).',
      },
      reasoning: {
        type: 'string',
        description: 'Optional reasoning stored on the Categorization row.',
      },
      confirm: {
        type: 'boolean',
        description:
          'true executes the write. Default false returns a preview only.',
      },
    },
    required: ['transactionIds', 'accountCode', 'accountName'],
  },
  async handler(rawInput: Record<string, unknown>, ctx: AgentToolContext) {
    const input = rawInput as unknown as CategorizeTransactionsInput;
    const { transactionIds, accountCode, accountName, reasoning } = input;
    const vatType = validateVatType(input.vatType);
    const confidence = clampConfidence(input.confidence);
    const confirm = input.confirm === true;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      throw new AgentToolError(
        `transactionIds must be a non-empty array`,
        'INVALID_INPUT',
      );
    }
    if (transactionIds.length > 50) {
      throw new AgentToolError(
        `too many transactionIds (max 50, got ${String(transactionIds.length)})`,
        'INVALID_INPUT',
      );
    }
    if (!accountCode.trim() || !accountName.trim()) {
      throw new AgentToolError(
        `accountCode and accountName are required`,
        'INVALID_INPUT',
      );
    }

    // Fetch transactions and enforce tenant isolation.
    const txs = await ctx.prisma.transaction.findMany({
      where: { id: { in: transactionIds }, isDeleted: false },
      select: {
        id: true,
        tenantId: true,
        status: true,
        payeeName: true,
        amountCents: true,
      },
    });

    if (txs.length !== transactionIds.length) {
      const found = new Set(txs.map((t) => t.id));
      const missing = transactionIds.filter((id) => !found.has(id));
      throw new AgentToolError(
        `transactions not found: ${missing.join(', ')}`,
        'TX_NOT_FOUND',
      );
    }
    const crossTenant = txs.filter((t) => t.tenantId !== ctx.tenantId);
    if (crossTenant.length > 0) {
      throw new AgentToolError(
        `tenant mismatch — refusing cross-tenant categorisation for ${String(crossTenant.length)} transactions`,
        'TENANT_MISMATCH',
      );
    }

    if (!confirm) {
      return {
        preview: true,
        tenantId: ctx.tenantId,
        would: {
          transactionCount: txs.length,
          accountCode,
          accountName,
          vatType,
          confidence,
        },
        transactionIds: txs.map((t) => t.id),
      };
    }

    // Confirmed. Write within a Prisma transaction: one Categorization per
    // tx, update tx.status, one audit log per tx.
    const written = await ctx.prisma.$transaction(async (prisma) => {
      const created: string[] = [];
      for (const tx of txs) {
        const cat = await prisma.categorization.create({
          data: {
            transactionId: tx.id,
            accountCode,
            accountName,
            confidenceScore: confidence,
            reasoning: reasoning ?? null,
            source: 'AI_AUTO',
            vatType,
          },
          select: { id: true },
        });
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { status: 'CATEGORIZED' },
        });
        await prisma.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId ?? null,
            agentId: ctx.agentId ?? null,
            entityType: 'transaction',
            entityId: tx.id,
            action: 'CATEGORIZE',
            beforeValue: { status: tx.status },
            afterValue: {
              status: 'CATEGORIZED',
              categorizationId: cat.id,
              accountCode,
              vatType,
              confidence,
            },
            changeSummary: `Agent categorised as ${accountCode} (${accountName}) with confidence ${String(confidence)}`,
          },
        });
        created.push(cat.id);
      }
      return created;
    });

    return {
      categorized: true,
      tenantId: ctx.tenantId,
      transactionCount: written.length,
      accountCode,
      accountName,
      vatType,
      categorizationIds: written,
    };
  },
};

function validateVatType(raw: string | undefined): VatType {
  if (raw == null) return 'STANDARD';
  const upper = raw.toUpperCase().replace(/[\s-]/g, '_');
  if ((VALID_VAT as readonly string[]).includes(upper)) {
    return upper as VatType;
  }
  throw new AgentToolError(
    `unknown vatType "${raw}". Valid: ${VALID_VAT.join(', ')}.`,
    'INVALID_INPUT',
  );
}

function clampConfidence(raw: number | undefined): number {
  if (raw == null) return 90;
  if (!Number.isFinite(raw)) return 90;
  return Math.max(0, Math.min(100, raw));
}
