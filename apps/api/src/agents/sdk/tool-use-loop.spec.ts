/**
 * BaseSdkAgent.runWithTools integration spec.
 *
 * Drives one full LLM tool-use cycle with a mocked ClaudeClientService:
 *   turn 1 → assistant returns a tool_use block (list_invoices).
 *   turn 2 → we execute the tool via the registry and feed the tool_result.
 *   turn 3 → assistant returns final text with stop_reason='end_turn'.
 *
 * Also asserts:
 *   - a tool handler throwing surfaces as an is_error tool_result and the loop
 *     continues without crashing.
 *   - the LLM cannot call a tool outside its agent's allowlist (registry
 *     returns an error, which we serialise back to the LLM).
 */

import { Logger } from '@nestjs/common';
import { BaseSdkAgent } from './base-sdk-agent';
import type { AgentDefinition } from './interfaces/sdk-agent.interface';
import type { SdkAgentFactory } from './sdk-agent.factory';
import type { SdkConfigService } from './sdk-config';
import type {
  ClaudeClientService,
  ClaudeResponse,
} from './claude-client.service';
import { AgentToolRegistry } from './tools/tool-registry.service';
import type { PrismaService } from '../../database/prisma/prisma.service';

class TestAgent extends BaseSdkAgent {
  constructor(factory: SdkAgentFactory, config: SdkConfigService) {
    super(factory, config, 'TestAgent');
  }
  getAgentDefinition(_tenantId: string): AgentDefinition {
    return {
      description: 'test',
      prompt: 'you are a test',
      tools: ['list_invoices'],
      model: 'haiku',
    };
  }
}

function makeFactory(): jest.Mocked<SdkAgentFactory> {
  return {
    createCategorizerAgent: jest.fn(),
    createMatcherAgent: jest.fn(),
    createSarsAgent: jest.fn(),
    createExtractionValidatorAgent: jest.fn(),
    createOrchestratorAgent: jest.fn(),
    createConversationalAgent: jest.fn(),
    createAgent: jest.fn(),
  } as unknown as jest.Mocked<SdkAgentFactory>;
}

function makeConfig(): jest.Mocked<SdkConfigService> {
  return {
    isEnabled: jest.fn().mockReturnValue(true),
    getModelForAgent: jest.fn().mockReturnValue('haiku'),
    hasApiKey: jest.fn().mockReturnValue(true),
    getApiKey: jest.fn().mockReturnValue('test'),
  } as unknown as jest.Mocked<SdkConfigService>;
}

function makePrisma(): PrismaService {
  return {
    invoice: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'i-1',
          invoiceNumber: 'INV-100',
          parentId: 'p-1',
          childId: 'c-1',
          issueDate: new Date('2026-06-01'),
          dueDate: new Date('2026-06-15'),
          totalCents: 100000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      ]),
    },
  } as unknown as PrismaService;
}

function claudeStub(
  sequence: Array<Partial<ClaudeResponse>>,
): jest.Mocked<ClaudeClientService> {
  const q = sequence.map((r) => ({
    content: '',
    contentBlocks: [],
    model: 'haiku',
    usage: { inputTokens: 0, outputTokens: 0 },
    stopReason: 'end_turn',
    ...r,
  }));
  const send = jest.fn().mockImplementation(() =>
    Promise.resolve(
      q.shift() ?? {
        content: '',
        contentBlocks: [],
        model: 'haiku',
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: 'end_turn',
      },
    ),
  );
  return {
    isAvailable: jest.fn().mockReturnValue(true),
    sendMessage: send,
    chat: jest.fn(),
  } as unknown as jest.Mocked<ClaudeClientService>;
}

describe('BaseSdkAgent.runWithTools', () => {
  it('executes a tool_use block, feeds the tool_result back, then returns the final text', async () => {
    const prisma = makePrisma();
    const registry = new AgentToolRegistry(prisma);
    const factory = makeFactory();
    const config = makeConfig();

    const claude = claudeStub([
      // Turn 1: LLM asks to call list_invoices with status=SENT
      {
        stopReason: 'tool_use',
        contentBlocks: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'list_invoices',
            input: { status: 'SENT' },
          },
        ],
      },
      // Turn 2: LLM returns final answer
      {
        stopReason: 'end_turn',
        content: 'You have 1 sent invoice: INV-100.',
        contentBlocks: [
          { type: 'text', text: 'You have 1 sent invoice: INV-100.' },
        ],
      },
    ]);

    const agent = new TestAgent(factory, config);
    const res = await agent.runWithTools(claude, registry, {
      agentType: 'conversational',
      tenantId: 'tenant-1',
      userMessage: 'How many SENT invoices are there?',
    });

    expect(res.toolCalls).toBe(1);
    expect(res.stopReason).toBe('end_turn');
    expect(res.content).toContain('INV-100');

    // Verify the real Prisma call happened via the registry handler.
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: 'SENT',
        }),
      }),
    );

    // Second sendMessage call must include the tool_result block matching tu_1.
    const secondCall = (claude.sendMessage as jest.Mock).mock.calls[1][0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const toolResult = lastMsg.content[0];
    expect(toolResult.type).toBe('tool_result');
    expect(toolResult.tool_use_id).toBe('tu_1');
    expect(toolResult.is_error).toBe(false);
    // Serialised handler result contains the invoice number.
    expect(String(toolResult.content)).toContain('INV-100');
  });

  it('surfaces a handler error as is_error=true and continues the loop', async () => {
    const prisma = {
      invoice: {
        findMany: jest.fn().mockRejectedValue(new Error('db explode')),
      },
    } as unknown as PrismaService;
    const registry = new AgentToolRegistry(prisma);
    const claude = claudeStub([
      {
        stopReason: 'tool_use',
        contentBlocks: [
          {
            type: 'tool_use',
            id: 'tu_err',
            name: 'list_invoices',
            input: {},
          },
        ],
      },
      {
        stopReason: 'end_turn',
        content: 'Sorry, I could not list your invoices right now.',
        contentBlocks: [
          {
            type: 'text',
            text: 'Sorry, I could not list your invoices right now.',
          },
        ],
      },
    ]);

    const agent = new TestAgent(makeFactory(), makeConfig());
    const res = await agent.runWithTools(claude, registry, {
      agentType: 'conversational',
      tenantId: 'tenant-1',
      userMessage: 'list invoices',
    });

    expect(res.toolCalls).toBe(1);
    expect(res.stopReason).toBe('end_turn');

    const secondCall = (claude.sendMessage as jest.Mock).mock.calls[1][0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    const toolResult = lastMsg.content[0];
    expect(toolResult.type).toBe('tool_result');
    expect(toolResult.is_error).toBe(true);
    expect(String(toolResult.content)).toContain('db explode');
  });

  it('blocks a tool call that is not on the agent allowlist', async () => {
    const registry = new AgentToolRegistry(makePrisma());
    const claude = claudeStub([
      {
        stopReason: 'tool_use',
        contentBlocks: [
          {
            // conversational agent may NOT call allocate_payment.
            type: 'tool_use',
            id: 'tu_bad',
            name: 'allocate_payment',
            input: { transactionId: 'x', invoiceId: 'y', amountCents: 1 },
          },
        ],
      },
      {
        stopReason: 'end_turn',
        content: 'I cannot do that.',
        contentBlocks: [{ type: 'text', text: 'I cannot do that.' }],
      },
    ]);

    const agent = new TestAgent(makeFactory(), makeConfig());
    await agent.runWithTools(claude, registry, {
      agentType: 'conversational',
      tenantId: 'tenant-1',
      userMessage: 'allocate a payment',
    });

    const secondCall = (claude.sendMessage as jest.Mock).mock.calls[1][0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    const toolResult = lastMsg.content[0];
    expect(toolResult.is_error).toBe(true);
    expect(String(toolResult.content)).toMatch(/TOOL_NOT_ALLOWED|not allowed/i);
  });

  it('respects the iteration cap and returns max_iterations', async () => {
    const registry = new AgentToolRegistry(makePrisma());
    // Always ask for a tool — never end the turn.
    const claude = {
      isAvailable: jest.fn().mockReturnValue(true),
      sendMessage: jest.fn().mockResolvedValue({
        content: 'thinking...',
        contentBlocks: [
          {
            type: 'tool_use',
            id: 'tu_x',
            name: 'list_invoices',
            input: {},
          },
        ],
        model: 'haiku',
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: 'tool_use',
      }),
      chat: jest.fn(),
    } as unknown as jest.Mocked<ClaudeClientService>;

    const agent = new TestAgent(makeFactory(), makeConfig());
    const res = await agent.runWithTools(claude, registry, {
      agentType: 'conversational',
      tenantId: 'tenant-1',
      userMessage: 'loop',
      maxIterations: 2,
    });
    expect(res.stopReason).toBe('max_iterations');
    expect(res.toolCalls).toBe(2);
  });
});

// The Logger import above is otherwise unused after tightening the file —
// keep a reference so ts-jest doesn't strip the import silently.
void Logger;
