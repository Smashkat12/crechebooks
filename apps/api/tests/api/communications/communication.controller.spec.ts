/**
 * Communication Controller Tests
 * TASK-COMM-003: Communication API Controller
 *
 * Unit tests for the Communication API controller.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException as NestNotFoundException } from '@nestjs/common';
import { CommunicationController } from '../../../src/api/communications/communication.controller';
import { AdhocCommunicationService } from '../../../src/communications/services/adhoc-communication.service';
import { RecipientResolverService } from '../../../src/communications/services/recipient-resolver.service';
import { BroadcastMessageEntity } from '../../../src/communications/entities/broadcast-message.entity';
import { MessageRecipientEntity } from '../../../src/communications/entities/message-recipient.entity';
import { RecipientGroupEntity } from '../../../src/communications/entities/recipient-group.entity';
import {
  RecipientType,
  CommunicationChannel,
  BroadcastStatus,
} from '../../../src/communications/types/communication.types';
import type { IUser } from '../../../src/database/entities/user.entity';
import type { BroadcastMessage, RecipientGroup } from '@prisma/client';

describe('CommunicationController', () => {
  let controller: CommunicationController;
  let adhocService: jest.Mocked<AdhocCommunicationService>;
  let recipientResolver: jest.Mocked<RecipientResolverService>;
  let broadcastEntity: jest.Mocked<BroadcastMessageEntity>;
  let recipientEntity: jest.Mocked<MessageRecipientEntity>;
  let recipientGroupEntity: jest.Mocked<RecipientGroupEntity>;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';

  const mockUser: IUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    auth0Id: 'auth0|admin123',
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'ADMIN' as any,
    isActive: true,
    lastLoginAt: null,
    currentTenantId: mockTenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBroadcast: BroadcastMessage = {
    id: 'broadcast-123',
    tenantId: mockTenantId,
    subject: 'Test Subject',
    body: 'Test message body',
    htmlBody: '<p>Test message body</p>',
    recipientType: 'parent',
    recipientFilter: null,
    recipientGroupId: null,
    channel: 'email',
    scheduledAt: null,
    sentAt: null,
    status: 'draft',
    totalRecipients: 5,
    sentCount: 0,
    failedCount: 0,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRecipientGroup: RecipientGroup = {
    id: 'group-123',
    tenantId: mockTenantId,
    name: 'All Active Parents',
    description: 'All parents with active enrollments',
    recipientType: 'parent',
    filterCriteria: { parentFilter: { isActive: true } },
    isSystem: false,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockAdhocService = {
      createBroadcast: jest.fn(),
      sendBroadcast: jest.fn(),
      cancelBroadcast: jest.fn(),
      getBroadcast: jest.fn(),
      listBroadcasts: jest.fn(),
    };

    const mockRecipientResolver = {
      resolve: jest.fn(),
    };

    const mockBroadcastEntity = {
      findById: jest.fn(),
      findByTenant: jest.fn(),
    };

    const mockRecipientEntity = {
      getDeliveryStats: jest.fn(),
    };

    const mockRecipientGroupEntity = {
      findById: jest.fn(),
      findByTenant: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunicationController],
      providers: [
        { provide: AdhocCommunicationService, useValue: mockAdhocService },
        { provide: RecipientResolverService, useValue: mockRecipientResolver },
        { provide: BroadcastMessageEntity, useValue: mockBroadcastEntity },
        { provide: MessageRecipientEntity, useValue: mockRecipientEntity },
        { provide: RecipientGroupEntity, useValue: mockRecipientGroupEntity },
      ],
    }).compile();

    controller = module.get<CommunicationController>(CommunicationController);
    adhocService = module.get(AdhocCommunicationService);
    recipientResolver = module.get(RecipientResolverService);
    broadcastEntity = module.get(BroadcastMessageEntity);
    recipientEntity = module.get(MessageRecipientEntity);
    recipientGroupEntity = module.get(RecipientGroupEntity);
  });

  describe('createBroadcast', () => {
    it('should create a broadcast and return response', async () => {
      adhocService.createBroadcast.mockResolvedValue(mockBroadcast);

      const dto = {
        subject: 'Test Subject',
        body: 'Test message body',
        recipient_type: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      };

      const result = await controller.createBroadcast(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(mockBroadcast.id);
      expect(result.data.subject).toBe(mockBroadcast.subject);
      expect(result.data.recipient_type).toBe(mockBroadcast.recipientType);
      expect(adhocService.createBroadcast).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        expect.objectContaining({
          subject: dto.subject,
          body: dto.body,
          recipientType: dto.recipient_type,
          channel: dto.channel,
        }),
      );
    });

    it('should transform filter criteria from snake_case to camelCase', async () => {
      adhocService.createBroadcast.mockResolvedValue(mockBroadcast);

      const dto = {
        body: 'Test message body',
        recipient_type: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
        recipient_filter: {
          parent_filter: {
            is_active: true,
            has_outstanding_balance: true,
            days_overdue: 30,
          },
        },
      };

      await controller.createBroadcast(dto, mockUser);

      expect(adhocService.createBroadcast).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        expect.objectContaining({
          recipientFilter: {
            parentFilter: {
              isActive: true,
              hasOutstandingBalance: true,
              daysOverdue: 30,
            },
          },
        }),
      );
    });
  });

  describe('sendBroadcast', () => {
    it('should queue broadcast for sending', async () => {
      adhocService.sendBroadcast.mockResolvedValue(undefined);

      const result = await controller.sendBroadcast('broadcast-123', mockUser);

      expect(result.message).toBe('Broadcast queued for sending');
      expect(adhocService.sendBroadcast).toHaveBeenCalledWith(
        mockTenantId,
        'broadcast-123',
        mockUserId,
      );
    });
  });

  describe('cancelBroadcast', () => {
    it('should cancel a pending broadcast', async () => {
      adhocService.cancelBroadcast.mockResolvedValue(undefined);

      const result = await controller.cancelBroadcast(
        'broadcast-123',
        mockUser,
      );

      expect(result.message).toBe('Broadcast cancelled');
      expect(adhocService.cancelBroadcast).toHaveBeenCalledWith(
        mockTenantId,
        'broadcast-123',
        mockUserId,
      );
    });
  });

  describe('listBroadcasts', () => {
    it('should return paginated list of broadcasts', async () => {
      adhocService.listBroadcasts.mockResolvedValue([mockBroadcast]);

      const result = await controller.listBroadcasts(
        { page: 1, limit: 20 },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(mockBroadcast.id);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('should filter by status', async () => {
      adhocService.listBroadcasts.mockResolvedValue([]);

      await controller.listBroadcasts(
        { page: 1, limit: 20, status: BroadcastStatus.SENT },
        mockUser,
      );

      expect(adhocService.listBroadcasts).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({ status: BroadcastStatus.SENT }),
      );
    });
  });

  describe('getBroadcast', () => {
    it('should return broadcast details with delivery stats', async () => {
      adhocService.getBroadcast.mockResolvedValue(mockBroadcast);
      recipientEntity.getDeliveryStats.mockResolvedValue({
        total: 5,
        emailSent: 5,
        emailDelivered: 4,
        emailOpened: 2,
        emailFailed: 0,
        whatsappSent: 0,
        whatsappDelivered: 0,
        whatsappRead: 0,
        whatsappFailed: 0,
        smsSent: 0,
        smsDelivered: 0,
        smsFailed: 0,
      });

      const result = await controller.getBroadcast('broadcast-123', mockUser);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(mockBroadcast.id);
      expect(result.data.delivery_stats).toBeDefined();
      expect(result.data.delivery_stats?.email_sent).toBe(5);
    });

    it('should throw NotFoundException for non-existent broadcast', async () => {
      adhocService.getBroadcast.mockResolvedValue(null);

      await expect(
        controller.getBroadcast('nonexistent-id', mockUser),
      ).rejects.toThrow();
    });
  });

  describe('previewRecipients', () => {
    it('should return preview of matching recipients', async () => {
      recipientResolver.resolve.mockResolvedValue([
        { id: 'parent-1', name: 'John Doe', email: 'john@test.com' },
        { id: 'parent-2', name: 'Jane Doe', email: 'jane@test.com' },
      ]);

      const dto = {
        recipient_type: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      };

      const result = await controller.previewRecipients(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(2);
      expect(result.data.recipients).toHaveLength(2);
      expect(result.data.has_more).toBe(false);
    });

    it('should indicate has_more when over 20 recipients', async () => {
      const manyRecipients = Array.from({ length: 25 }, (_, i) => ({
        id: `parent-${i}`,
        name: `Parent ${i}`,
        email: `parent${i}@test.com`,
      }));
      recipientResolver.resolve.mockResolvedValue(manyRecipients);

      const dto = {
        recipient_type: RecipientType.PARENT,
      };

      const result = await controller.previewRecipients(dto, mockUser);

      expect(result.data.total).toBe(25);
      expect(result.data.recipients).toHaveLength(20);
      expect(result.data.has_more).toBe(true);
    });
  });

  describe('listGroups', () => {
    it('should return list of recipient groups', async () => {
      recipientGroupEntity.findByTenant.mockResolvedValue([mockRecipientGroup]);

      const result = await controller.listGroups(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(mockRecipientGroup.id);
      expect(result.data[0].name).toBe(mockRecipientGroup.name);
    });
  });

  describe('createGroup', () => {
    it('should create a recipient group', async () => {
      recipientGroupEntity.create.mockResolvedValue(mockRecipientGroup);

      const dto = {
        name: 'All Active Parents',
        description: 'All parents with active enrollments',
        recipient_type: RecipientType.PARENT,
        filter_criteria: {
          parent_filter: {
            is_active: true,
          },
        },
      };

      const result = await controller.createGroup(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe(mockRecipientGroup.name);
      expect(recipientGroupEntity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          name: dto.name,
          recipientType: dto.recipient_type,
        }),
        mockUserId,
      );
    });
  });

  describe('getGroup', () => {
    it('should return recipient group details', async () => {
      recipientGroupEntity.findById.mockResolvedValue(mockRecipientGroup);

      const result = await controller.getGroup('group-123', mockUser);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(mockRecipientGroup.id);
    });

    it('should throw NotFoundException for non-existent group', async () => {
      recipientGroupEntity.findById.mockResolvedValue(null);

      await expect(
        controller.getGroup('nonexistent-id', mockUser),
      ).rejects.toThrow();
    });

    it('should throw NotFoundException for group from different tenant', async () => {
      recipientGroupEntity.findById.mockResolvedValue({
        ...mockRecipientGroup,
        tenantId: 'other-tenant',
      });

      await expect(
        controller.getGroup('group-123', mockUser),
      ).rejects.toThrow();
    });
  });

  describe('deleteGroup', () => {
    it('should delete a recipient group', async () => {
      recipientGroupEntity.delete.mockResolvedValue(undefined);

      await controller.deleteGroup('group-123', mockUser);

      expect(recipientGroupEntity.delete).toHaveBeenCalledWith(
        mockTenantId,
        'group-123',
      );
    });
  });
});
