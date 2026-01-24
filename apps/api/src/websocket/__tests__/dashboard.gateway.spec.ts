/**
 * Dashboard Gateway Tests
 * TASK-FEAT-101: Real-time Dashboard with WebSocket Updates
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { DashboardGateway } from '../dashboard.gateway';
import { EventEmitterService } from '../services/event-emitter.service';
import { WsJwtGuard, AuthenticatedSocket } from '../guards/ws-jwt.guard';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  DashboardEventType,
  getTenantRoom,
  createPaymentReceivedEvent,
} from '../events/dashboard.events';
import { IUser, UserRole } from '../../database/entities/user.entity';

describe('DashboardGateway', () => {
  let gateway: DashboardGateway;
  let eventEmitter: EventEmitterService;

  const mockUser: IUser = {
    id: 'user-123',
    tenantId: 'tenant-456',
    auth0Id: 'auth0|123',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.ADMIN,
    isActive: true,
    lastLoginAt: null,
    currentTenantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn().mockResolvedValue([]),
  };

  const mockSocket: Partial<AuthenticatedSocket> = {
    id: 'socket-123',
    rooms: new Set(['socket-123']),
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    user: mockUser,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardGateway,
        EventEmitterService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'NODE_ENV') return 'development';
              if (key === 'JWT_SECRET') return 'test-secret';
              return undefined;
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
            decode: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
        WsJwtGuard,
      ],
    }).compile();

    gateway = module.get<DashboardGateway>(DashboardGateway);
    eventEmitter = module.get<EventEmitterService>(EventEmitterService);

    // Set up the server
    gateway.server = mockServer as unknown as Server;
    gateway.afterInit(mockServer as unknown as Server);
  });

  describe('afterInit', () => {
    it('should register server with event emitter', () => {
      expect(eventEmitter.isServerAvailable()).toBe(true);
    });
  });

  describe('handleConnection', () => {
    it('should accept connection when under limit', async () => {
      gateway.handleConnection(mockSocket as unknown as Socket);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(gateway.getConnectionCount()).toBe(1);
    });

    it('should reject connection when limit reached', async () => {
      // Set connection count to max
      for (let i = 0; i < 1000; i++) {
        gateway.handleConnection({
          ...mockSocket,
          id: `socket-${i}`,
        } as unknown as Socket);
      }

      const newSocket: Partial<Socket> = {
        id: 'socket-overflow',
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      gateway.handleConnection(newSocket as Socket);
      expect(newSocket.emit).toHaveBeenCalledWith(
        DashboardEventType.ERROR,
        expect.objectContaining({
          code: 'CONNECTION_LIMIT',
        }),
      );
      expect(newSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should decrement connection count', async () => {
      gateway.handleConnection(mockSocket as unknown as Socket);
      expect(gateway.getConnectionCount()).toBe(1);

      gateway.handleDisconnect(mockSocket as unknown as Socket);
      expect(gateway.getConnectionCount()).toBe(0);
    });

    it('should not go below zero', () => {
      gateway.handleDisconnect(mockSocket as unknown as Socket);
      expect(gateway.getConnectionCount()).toBe(0);
    });
  });

  describe('handleJoin', () => {
    it('should join tenant room based on user tenantId', () => {
      gateway.handleJoin(mockSocket as AuthenticatedSocket, {});

      const expectedRoom = getTenantRoom(mockUser.tenantId!);
      expect(mockSocket.join).toHaveBeenCalledWith(expectedRoom);
    });

    it('should emit connected event after joining', () => {
      gateway.handleJoin(mockSocket as AuthenticatedSocket, {});

      expect(mockSocket.emit).toHaveBeenCalledWith(
        DashboardEventType.CONNECTED,
        expect.objectContaining({
          type: DashboardEventType.CONNECTED,
          tenantId: mockUser.tenantId,
          data: expect.objectContaining({
            clientId: mockSocket.id,
            room: getTenantRoom(mockUser.tenantId!),
          }),
        }),
      );
    });

    it('should leave existing tenant rooms before joining new one', () => {
      const socketWithRooms: Partial<AuthenticatedSocket> = {
        ...mockSocket,
        rooms: new Set(['socket-123', 'tenant:old-tenant']),
      };

      gateway.handleJoin(socketWithRooms as AuthenticatedSocket, {});

      expect(socketWithRooms.leave).toHaveBeenCalledWith('tenant:old-tenant');
    });
  });

  describe('handleLeave', () => {
    it('should leave tenant room', () => {
      gateway.handleLeave(mockSocket as AuthenticatedSocket);

      const expectedRoom = getTenantRoom(mockUser.tenantId!);
      expect(mockSocket.leave).toHaveBeenCalledWith(expectedRoom);
    });
  });

  describe('handlePing', () => {
    it('should return pong with timestamp', () => {
      const result = gateway.handlePing(mockSocket as unknown as Socket);

      expect(result.event).toBe('pong');
      expect(result.data.timestamp).toBeDefined();
    });
  });

  describe('broadcastToTenant', () => {
    it('should emit event to tenant room', () => {
      const tenantId = 'tenant-456';
      const eventType = 'test_event';
      const data = { test: true };

      gateway.broadcastToTenant(tenantId, eventType, data);

      expect(mockServer.to).toHaveBeenCalledWith(getTenantRoom(tenantId));
      expect(mockServer.emit).toHaveBeenCalledWith(
        eventType,
        expect.objectContaining({
          type: eventType,
          tenantId,
          data,
        }),
      );
    });
  });
});

describe('EventEmitterService', () => {
  let service: EventEmitterService;

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    service = new EventEmitterService();
    service.setServer(mockServer as unknown as Server);
    service.clearRateLimits();
    jest.clearAllMocks();
  });

  describe('setServer', () => {
    it('should set server and mark as available', () => {
      const newService = new EventEmitterService();
      expect(newService.isServerAvailable()).toBe(false);

      newService.setServer(mockServer as unknown as Server);
      expect(newService.isServerAvailable()).toBe(true);
    });
  });

  describe('emitPaymentReceived', () => {
    it('should emit payment received event to tenant room', () => {
      const tenantId = 'tenant-123';
      const paymentData = {
        paymentId: 'pay-1',
        amount: 1500,
        parentName: 'John Smith',
        childName: 'Jane Smith',
        invoiceNumber: 'INV-001',
      };

      const result = service.emitPaymentReceived(tenantId, paymentData);

      expect(result).toBe(true);
      expect(mockServer.to).toHaveBeenCalledWith(getTenantRoom(tenantId));
      expect(mockServer.emit).toHaveBeenCalledWith(
        DashboardEventType.PAYMENT_RECEIVED,
        expect.objectContaining({
          type: DashboardEventType.PAYMENT_RECEIVED,
          tenantId,
          data: paymentData,
        }),
      );
    });
  });

  describe('emitInvoiceStatusChanged', () => {
    it('should emit invoice status changed event', () => {
      const tenantId = 'tenant-123';
      const invoiceData = {
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-001',
        previousStatus: 'PENDING',
        newStatus: 'PAID',
      };

      const result = service.emitInvoiceStatusChanged(tenantId, invoiceData);

      expect(result).toBe(true);
      expect(mockServer.emit).toHaveBeenCalledWith(
        DashboardEventType.INVOICE_STATUS_CHANGED,
        expect.objectContaining({
          type: DashboardEventType.INVOICE_STATUS_CHANGED,
          data: invoiceData,
        }),
      );
    });
  });

  describe('emitArrearsAlert', () => {
    it('should emit arrears alert event', () => {
      const tenantId = 'tenant-123';
      const arrearsData = {
        parentId: 'parent-1',
        parentName: 'John Smith',
        totalArrears: 3500,
        daysOverdue: 45,
        severity: 'warning' as const,
      };

      const result = service.emitArrearsAlert(tenantId, arrearsData);

      expect(result).toBe(true);
      expect(mockServer.emit).toHaveBeenCalledWith(
        DashboardEventType.ARREARS_ALERT,
        expect.objectContaining({
          type: DashboardEventType.ARREARS_ALERT,
          data: arrearsData,
        }),
      );
    });
  });

  describe('emitMetricsUpdated', () => {
    it('should emit metrics updated event', () => {
      const tenantId = 'tenant-123';
      const metricsData = {
        revenue: { total: 50000, collected: 45000 },
        arrears: { total: 5000, count: 3 },
      };

      const result = service.emitMetricsUpdated(tenantId, metricsData);

      expect(result).toBe(true);
      expect(mockServer.emit).toHaveBeenCalledWith(
        DashboardEventType.METRICS_UPDATED,
        expect.objectContaining({
          type: DashboardEventType.METRICS_UPDATED,
          data: metricsData,
        }),
      );
    });
  });

  describe('rate limiting', () => {
    it('should allow events within rate limit', () => {
      const tenantId = 'tenant-123';
      const paymentData = {
        paymentId: 'pay-1',
        amount: 1500,
        parentName: 'John',
        childName: 'Jane',
        invoiceNumber: 'INV-001',
      };

      // Should allow 10 events per second
      for (let i = 0; i < 10; i++) {
        const result = service.emitPaymentReceived(tenantId, paymentData);
        expect(result).toBe(true);
      }
    });

    it('should block events exceeding rate limit', () => {
      const tenantId = 'tenant-123';
      const paymentData = {
        paymentId: 'pay-1',
        amount: 1500,
        parentName: 'John',
        childName: 'Jane',
        invoiceNumber: 'INV-001',
      };

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        service.emitPaymentReceived(tenantId, paymentData);
      }

      // Next event should be blocked
      const result = service.emitPaymentReceived(tenantId, paymentData);
      expect(result).toBe(false);
    });

    it('should reset rate limit after window expires', async () => {
      jest.useFakeTimers();

      const tenantId = 'tenant-123';
      const paymentData = {
        paymentId: 'pay-1',
        amount: 1500,
        parentName: 'John',
        childName: 'Jane',
        invoiceNumber: 'INV-001',
      };

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        service.emitPaymentReceived(tenantId, paymentData);
      }

      // Blocked
      expect(service.emitPaymentReceived(tenantId, paymentData)).toBe(false);

      // Advance time past rate limit window
      jest.advanceTimersByTime(1001);

      // Should be allowed again
      expect(service.emitPaymentReceived(tenantId, paymentData)).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('without server', () => {
    it('should return false when server not available', () => {
      const newService = new EventEmitterService();
      const result = newService.emitPaymentReceived('tenant-1', {
        paymentId: 'pay-1',
        amount: 100,
        parentName: 'Test',
        childName: 'Child',
        invoiceNumber: 'INV-001',
      });

      expect(result).toBe(false);
    });
  });

  describe('getTenantClientCount', () => {
    it('should return count of clients in tenant room', async () => {
      const tenantId = 'tenant-123';
      mockServer.fetchSockets.mockResolvedValue([{}, {}, {}]);

      const count = await service.getTenantClientCount(tenantId);

      expect(count).toBe(3);
      expect(mockServer.in).toHaveBeenCalledWith(getTenantRoom(tenantId));
    });

    it('should return 0 when server not available', async () => {
      const newService = new EventEmitterService();
      const count = await newService.getTenantClientCount('tenant-1');

      expect(count).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should emit to all connected clients', () => {
      const event = createPaymentReceivedEvent('tenant-1', {
        paymentId: 'pay-1',
        amount: 1000,
        parentName: 'John',
        childName: 'Jane',
        invoiceNumber: 'INV-001',
      });

      const result = service.broadcast(event);

      expect(result).toBe(true);
      expect(mockServer.emit).toHaveBeenCalledWith(
        DashboardEventType.PAYMENT_RECEIVED,
        event,
      );
    });
  });
});

describe('Dashboard Events', () => {
  describe('getTenantRoom', () => {
    it('should return properly formatted room name', () => {
      expect(getTenantRoom('tenant-123')).toBe('tenant:tenant-123');
    });
  });

  describe('event creators', () => {
    it('should create payment received event with correct structure', () => {
      const event = createPaymentReceivedEvent('tenant-1', {
        paymentId: 'pay-1',
        amount: 1500,
        parentName: 'John',
        childName: 'Jane',
        invoiceNumber: 'INV-001',
      });

      expect(event.type).toBe(DashboardEventType.PAYMENT_RECEIVED);
      expect(event.tenantId).toBe('tenant-1');
      expect(event.timestamp).toBeDefined();
      expect(event.data.paymentId).toBe('pay-1');
    });
  });
});
