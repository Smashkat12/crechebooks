/**
 * AgentRolloutController — unit specs
 *
 * The controller is a thin dispatcher, but the routing decisions we verify here
 * are load-bearing:
 *  - Guard metadata is set to SUPER_ADMIN (auth guard test).
 *  - Unknown agentType path parameters are rejected with a structured failure
 *    rather than causing a service call (tenant isolation defence).
 *  - Query-string periodDays is coerced and defaulted safely.
 *  - Actor context (userId, IP, UA) is forwarded to the service.
 *  - promote path forwards force-free reason to service.
 *  - rollback-all path calls the service correctly.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AgentRolloutController } from '../agent-rollout.controller';
import { AgentRolloutService } from '../agent-rollout.service';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import type { IUser } from '../../../../database/entities/user.entity';

const TENANT = '00000000-0000-0000-0000-000000000001';

function buildReq(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ip: '10.0.0.9',
    headers: {
      'user-agent': 'jest',
      'x-forwarded-for': '203.0.113.5',
      ...(overrides.headers as Record<string, unknown>),
    },
    ...overrides,
  } as unknown as import('express').Request;
}

const SUPER: IUser = {
  id: 'admin-1',
  tenantId: null,
  auth0Id: 'auth0|1',
  email: 'admin@example.com',
  name: 'Admin',
  role: UserRole.SUPER_ADMIN,
  isActive: true,
  lastLoginAt: null,
  currentTenantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AgentRolloutController', () => {
  let controller: AgentRolloutController;
  let service: {
    listAll: jest.Mock;
    getTenant: jest.Mock;
    setMode: jest.Mock;
    promote: jest.Mock;
    rollbackAll: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listAll: jest.fn().mockResolvedValue({
        rows: [],
        periodDays: 7,
        generatedAt: '',
      }),
      getTenant: jest.fn().mockResolvedValue({
        tenantId: TENANT,
        tenantName: 'X',
        agents: [],
        periodDays: 7,
        generatedAt: '',
      }),
      setMode: jest.fn().mockResolvedValue({
        success: true,
        tenantId: TENANT,
        agentType: 'categorizer',
        previousMode: 'DISABLED',
        newMode: 'SHADOW',
      }),
      promote: jest.fn().mockResolvedValue({
        success: true,
        tenantId: TENANT,
        agentType: 'categorizer',
        previousMode: 'SHADOW',
        newMode: 'PRIMARY',
      }),
      rollbackAll: jest.fn().mockResolvedValue({
        success: true,
        tenantId: TENANT,
        results: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentRolloutController],
      providers: [{ provide: AgentRolloutService, useValue: service }],
    }).compile();

    controller = module.get(AgentRolloutController);
  });

  describe('authorization metadata', () => {
    it('every route requires SUPER_ADMIN via @Roles metadata', () => {
      const reflector = new Reflector();
      const routes: Array<keyof AgentRolloutController> = [
        'list',
        'getForTenant',
        'setMode',
        'promote',
        'rollbackAll',
      ];
      for (const route of routes) {
        const roles = reflector.get<UserRole[]>(ROLES_KEY, controller[route]);
        expect(roles).toEqual([UserRole.SUPER_ADMIN]);
      }
    });
  });

  describe('list', () => {
    it('defaults periodDays to 7 when missing / invalid', async () => {
      await controller.list();
      expect(service.listAll).toHaveBeenLastCalledWith(7);
      await controller.list('nonsense');
      expect(service.listAll).toHaveBeenLastCalledWith(7);
      await controller.list('14');
      expect(service.listAll).toHaveBeenLastCalledWith(14);
    });
  });

  describe('getForTenant', () => {
    it('forwards periodDays and tenantId to service', async () => {
      await controller.getForTenant(TENANT, '30');
      expect(service.getTenant).toHaveBeenCalledWith(TENANT, 30);
    });
  });

  describe('setMode', () => {
    it('returns structured failure for unknown agent type without touching service', async () => {
      const res = await controller.setMode(
        TENANT,
        'not-a-real-agent',
        { mode: 'SHADOW', reason: 'x' },
        SUPER,
        buildReq(),
      );
      expect(res.success).toBe(false);
      expect(res.reason).toContain('Unknown agent type');
      expect(service.setMode).not.toHaveBeenCalled();
    });

    it('forwards actor context (userId, IP, UA) to service', async () => {
      await controller.setMode(
        TENANT,
        'categorizer',
        { mode: 'SHADOW', reason: 'ramp' },
        SUPER,
        buildReq(),
      );
      expect(service.setMode).toHaveBeenCalledWith(
        TENANT,
        'categorizer',
        'SHADOW',
        'ramp',
        false,
        expect.objectContaining({
          userId: 'admin-1',
          userAgent: 'jest',
          ipAddress: '203.0.113.5',
        }),
      );
    });

    it('passes force=true when body sets it', async () => {
      await controller.setMode(
        TENANT,
        'categorizer',
        { mode: 'PRIMARY', reason: 'override', force: true },
        SUPER,
        buildReq(),
      );
      expect(service.setMode).toHaveBeenCalledWith(
        TENANT,
        'categorizer',
        'PRIMARY',
        'override',
        true,
        expect.any(Object),
      );
    });
  });

  describe('promote', () => {
    it('rejects unknown agent type', async () => {
      const res = await controller.promote(
        TENANT,
        'bogus',
        { reason: 'x' },
        SUPER,
        buildReq(),
      );
      expect(res.success).toBe(false);
      expect(service.promote).not.toHaveBeenCalled();
    });

    it('forwards known agent type and reason', async () => {
      await controller.promote(
        TENANT,
        'sars',
        { reason: 'weekly' },
        SUPER,
        buildReq(),
      );
      expect(service.promote).toHaveBeenCalledWith(
        TENANT,
        'sars',
        'weekly',
        expect.objectContaining({ userId: 'admin-1' }),
      );
    });
  });

  describe('rollbackAll', () => {
    it('forwards tenant and reason', async () => {
      await controller.rollbackAll(
        TENANT,
        { reason: 'safety brake' },
        SUPER,
        buildReq(),
      );
      expect(service.rollbackAll).toHaveBeenCalledWith(
        TENANT,
        'safety brake',
        expect.objectContaining({ userId: 'admin-1' }),
      );
    });
  });
});
