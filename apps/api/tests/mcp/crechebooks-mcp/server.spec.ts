/**
 * CrecheBooksMcpService Server Tests
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Tests tool registration, executeTool, listTools, optional ruvector tool.
 * Uses mocked PrismaService and RuvectorService.
 */

import { CrecheBooksMcpService } from '../../../src/mcp/crechebooks-mcp/server';
import type { PrismaService } from '../../../src/database/prisma/prisma.service';
import type { RuvectorService } from '../../../src/agents/sdk/ruvector.service';

function createMockPrisma(): PrismaService {
  const mockModel = {
    findMany: jest.fn().mockResolvedValue([]),
  };
  return {
    payeePattern: mockModel,
    categorization: mockModel,
    invoice: mockModel,
    transaction: mockModel,
  } as unknown as PrismaService;
}

function createMockRuvector(available: boolean): RuvectorService {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    searchSimilar: jest.fn().mockResolvedValue([]),
  } as unknown as RuvectorService;
}

describe('CrecheBooksMcpService', () => {
  describe('initialization', () => {
    it('should register 5 core tools when ruvector is unavailable', () => {
      const prisma = createMockPrisma();
      const ruvector = createMockRuvector(false);
      const service = new CrecheBooksMcpService(prisma, ruvector);

      service.onModuleInit();

      const tools = service.listTools();
      expect(tools).toHaveLength(5);
      expect(tools).toContain('get_patterns');
      expect(tools).toContain('get_history');
      expect(tools).toContain('get_invoices');
      expect(tools).toContain('query_transactions');
      expect(tools).toContain('get_reports');
      expect(tools).not.toContain('search_similar_transactions');
    });

    it('should register 6 tools when ruvector is available', () => {
      const prisma = createMockPrisma();
      const ruvector = createMockRuvector(true);
      const service = new CrecheBooksMcpService(prisma, ruvector);

      service.onModuleInit();

      const tools = service.listTools();
      expect(tools).toHaveLength(6);
      expect(tools).toContain('search_similar_transactions');
    });

    it('should register 5 tools when ruvector is not injected', () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);

      service.onModuleInit();

      expect(service.listTools()).toHaveLength(5);
    });
  });

  describe('executeTool', () => {
    it('should execute a registered tool successfully', async () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);
      service.onModuleInit();

      const result = await service.executeTool('get_patterns', {
        tenantId: 'tenant-123',
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.toolName).toBe('get_patterns');
    });

    it('should throw for unknown tool name', async () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);
      service.onModuleInit();

      await expect(
        service.executeTool('nonexistent_tool', {}),
      ).rejects.toThrow('Tool "nonexistent_tool" not found');
    });

    it('should include available tools in error message', async () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);
      service.onModuleInit();

      try {
        await service.executeTool('nonexistent', {});
      } catch (error) {
        expect((error as Error).message).toContain('get_patterns');
        expect((error as Error).message).toContain('get_history');
      }
    });
  });

  describe('listTools', () => {
    it('should return an array of tool names', () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);
      service.onModuleInit();

      const tools = service.listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(typeof tools[0]).toBe('string');
    });
  });

  describe('getToolDefinitions', () => {
    it('should return tool definitions with name, description, and inputSchema', () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);
      service.onModuleInit();

      const definitions = service.getToolDefinitions();
      expect(definitions).toHaveLength(5);

      for (const def of definitions) {
        expect(def.name).toBeDefined();
        expect(def.description).toBeDefined();
        expect(def.inputSchema).toBeDefined();
        expect(def.inputSchema.type).toBe('object');
        expect(def.inputSchema.required).toContain('tenantId');
        expect(typeof def.handler).toBe('function');
      }
    });
  });

  describe('hasTool', () => {
    it('should return true for registered tools', () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);
      service.onModuleInit();

      expect(service.hasTool('get_patterns')).toBe(true);
      expect(service.hasTool('get_history')).toBe(true);
    });

    it('should return false for unregistered tools', () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);
      service.onModuleInit();

      expect(service.hasTool('nonexistent')).toBe(false);
    });
  });

  describe('getServerInfo', () => {
    it('should return server metadata with ruvector unavailable', () => {
      const prisma = createMockPrisma();
      const ruvector = createMockRuvector(false);
      const service = new CrecheBooksMcpService(prisma, ruvector);
      service.onModuleInit();

      const info = service.getServerInfo();
      expect(info.name).toBe('crechebooks-mcp');
      expect(info.version).toBe('1.0.0');
      expect(info.toolCount).toBe(5);
      expect(info.ruvectorAvailable).toBe(false);
    });

    it('should return server metadata with ruvector available', () => {
      const prisma = createMockPrisma();
      const ruvector = createMockRuvector(true);
      const service = new CrecheBooksMcpService(prisma, ruvector);
      service.onModuleInit();

      const info = service.getServerInfo();
      expect(info.toolCount).toBe(6);
      expect(info.ruvectorAvailable).toBe(true);
    });

    it('should handle undefined ruvector', () => {
      const prisma = createMockPrisma();
      const service = new CrecheBooksMcpService(prisma, undefined);
      service.onModuleInit();

      const info = service.getServerInfo();
      expect(info.ruvectorAvailable).toBe(false);
    });
  });
});
