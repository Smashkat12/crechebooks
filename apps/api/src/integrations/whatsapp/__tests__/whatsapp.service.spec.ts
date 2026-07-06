/**
 * WhatsApp Service Tests
 *
 * Covers the database-side consent and history methods
 * (optIn, optOut, getMessageHistory) and phone formatting.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppService } from '../whatsapp.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { WhatsAppMessageEntity } from '../entities/whatsapp-message.entity';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let mockPrisma: any;
  let mockMessageEntity: any;

  const tenantId = 'tenant-123';
  const parentId = 'parent-123';

  beforeEach(async () => {
    mockPrisma = {
      parent: {
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };

    mockMessageEntity = {
      findByTenantAndParent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsAppMessageEntity, useValue: mockMessageEntity },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
  });

  describe('Phone Number Formatting', () => {
    it('should format South African number starting with 0', () => {
      expect(service.formatPhoneE164('0821234567')).toBe('+27821234567');
    });

    it('should format number with 27 prefix', () => {
      expect(service.formatPhoneE164('27821234567')).toBe('+27821234567');
    });

    it('should keep E.164 format unchanged', () => {
      expect(service.formatPhoneE164('+27821234567')).toBe('+27821234567');
    });

    it('should format 9-digit number without leading 0', () => {
      expect(service.formatPhoneE164('821234567')).toBe('+27821234567');
    });

    it('should strip non-digit characters', () => {
      expect(service.formatPhoneE164('082-123-4567')).toBe('+27821234567');
    });

    it('should return empty string for invalid input', () => {
      expect(service.formatPhoneE164(null as any)).toBe('');
      expect(service.formatPhoneE164(undefined as any)).toBe('');
    });
  });

  describe('optIn', () => {
    it('should set whatsappOptIn to true for the parent', async () => {
      mockPrisma.parent.update.mockResolvedValue({ id: parentId });

      await service.optIn(parentId);

      expect(mockPrisma.parent.update).toHaveBeenCalledWith({
        where: { id: parentId },
        data: expect.objectContaining({ whatsappOptIn: true }),
      });
    });
  });

  describe('optOut', () => {
    it('should opt out all parents matching the phone number', async () => {
      mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });

      await service.optOut('0821234567');

      expect(mockPrisma.parent.updateMany).toHaveBeenCalledWith({
        where: {
          OR: [{ phone: '+27821234567' }, { whatsapp: '+27821234567' }],
        },
        data: expect.objectContaining({ whatsappOptIn: false }),
      });
    });

    it('should not throw when no parents match', async () => {
      mockPrisma.parent.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.optOut('0829999999')).resolves.toBeUndefined();
    });
  });

  describe('getMessageHistory', () => {
    it('should return messages from the entity with default limit', async () => {
      const messages = [{ id: 'msg-1' }];
      mockMessageEntity.findByTenantAndParent.mockResolvedValue(messages);

      const result = await service.getMessageHistory(tenantId, parentId);

      expect(result).toBe(messages);
      expect(mockMessageEntity.findByTenantAndParent).toHaveBeenCalledWith(
        tenantId,
        parentId,
        { limit: 50 },
      );
    });

    it('should pass a custom limit through', async () => {
      mockMessageEntity.findByTenantAndParent.mockResolvedValue([]);

      await service.getMessageHistory(tenantId, parentId, 10);

      expect(mockMessageEntity.findByTenantAndParent).toHaveBeenCalledWith(
        tenantId,
        parentId,
        { limit: 10 },
      );
    });
  });
});

describe('WhatsAppService (without message entity)', () => {
  it('should return empty history when entity is not available', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppService, { provide: PrismaService, useValue: {} }],
    }).compile();

    const service = module.get<WhatsAppService>(WhatsAppService);

    await expect(
      service.getMessageHistory('tenant-123', 'parent-123'),
    ).resolves.toEqual([]);
  });
});
