/**
 * ReminderTemplateService Tests
 * TASK-PAY-017: Tenant-Customizable Reminder Template Entity
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ReminderTemplateService } from '../reminder-template.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  ReminderStage,
  ReminderChannel,
  CreateReminderTemplateDto,
  UpdateReminderTemplateDto,
  DEFAULT_TEMPLATES,
} from '../dto/reminder-template.dto';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

describe('ReminderTemplateService', () => {
  let service: ReminderTemplateService;
  let mockPrisma: {
    reminderTemplate: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const tenantId = 'tenant-123';

  const mockTemplate = {
    id: 'template-1',
    tenantId,
    stage: ReminderStage.FIRST,
    daysOverdue: 7,
    channels: [ReminderChannel.EMAIL],
    emailSubject: 'Test Subject',
    emailBody: 'Test Body with {{parentName}}',
    whatsappBody: null,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(async () => {
    mockPrisma = {
      reminderTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReminderTemplateService>(ReminderTemplateService);
  });

  describe('getTemplates', () => {
    it('should return all templates for a tenant', async () => {
      mockPrisma.reminderTemplate.findMany.mockResolvedValue([mockTemplate]);

      const result = await service.getTemplates(tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockTemplate.id);
      expect(result[0].stage).toBe(ReminderStage.FIRST);
      expect(mockPrisma.reminderTemplate.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: { daysOverdue: 'asc' },
      });
    });

    it('should return empty array if no templates exist', async () => {
      mockPrisma.reminderTemplate.findMany.mockResolvedValue([]);

      const result = await service.getTemplates(tenantId);

      expect(result).toHaveLength(0);
    });
  });

  describe('getActiveTemplates', () => {
    it('should return only active templates', async () => {
      mockPrisma.reminderTemplate.findMany.mockResolvedValue([mockTemplate]);

      const result = await service.getActiveTemplates(tenantId);

      expect(result).toHaveLength(1);
      expect(mockPrisma.reminderTemplate.findMany).toHaveBeenCalledWith({
        where: { tenantId, isActive: true },
        orderBy: { daysOverdue: 'asc' },
      });
    });
  });

  describe('getTemplateForStage', () => {
    it('should return template for specific stage', async () => {
      mockPrisma.reminderTemplate.findUnique.mockResolvedValue(mockTemplate);

      const result = await service.getTemplateForStage(
        tenantId,
        ReminderStage.FIRST,
      );

      expect(result).not.toBeNull();
      expect(result!.stage).toBe(ReminderStage.FIRST);
      expect(mockPrisma.reminderTemplate.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_stage: {
            tenantId,
            stage: ReminderStage.FIRST,
          },
        },
      });
    });

    it('should return null if template not found', async () => {
      mockPrisma.reminderTemplate.findUnique.mockResolvedValue(null);

      const result = await service.getTemplateForStage(
        tenantId,
        ReminderStage.FIRST,
      );

      expect(result).toBeNull();
    });

    it('should return null if template is inactive', async () => {
      mockPrisma.reminderTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        isActive: false,
      });

      const result = await service.getTemplateForStage(
        tenantId,
        ReminderStage.FIRST,
      );

      expect(result).toBeNull();
    });
  });

  describe('getTemplateById', () => {
    it('should return template by ID', async () => {
      mockPrisma.reminderTemplate.findFirst.mockResolvedValue(mockTemplate);

      const result = await service.getTemplateById('template-1', tenantId);

      expect(result.id).toBe('template-1');
      expect(mockPrisma.reminderTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'template-1', tenantId },
      });
    });

    it('should throw NotFoundException if template not found', async () => {
      mockPrisma.reminderTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getTemplateById('non-existent', tenantId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertTemplate', () => {
    it('should create new template', async () => {
      const createDto: CreateReminderTemplateDto = {
        stage: ReminderStage.FIRST,
        daysOverdue: 7,
        channels: [ReminderChannel.EMAIL],
        emailSubject: 'New Subject',
        emailBody: 'New Body',
      };

      mockPrisma.reminderTemplate.upsert.mockResolvedValue({
        ...mockTemplate,
        emailSubject: createDto.emailSubject,
        emailBody: createDto.emailBody,
      });

      const result = await service.upsertTemplate(tenantId, createDto);

      expect(result.emailSubject).toBe('New Subject');
      expect(mockPrisma.reminderTemplate.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_stage: {
            tenantId,
            stage: ReminderStage.FIRST,
          },
        },
        update: expect.objectContaining({
          daysOverdue: 7,
          channels: [ReminderChannel.EMAIL],
        }),
        create: expect.objectContaining({
          tenantId,
          stage: ReminderStage.FIRST,
        }),
      });
    });

    it('should throw BusinessException if email channel without email content', async () => {
      const createDto: CreateReminderTemplateDto = {
        stage: ReminderStage.FIRST,
        daysOverdue: 7,
        channels: [ReminderChannel.EMAIL],
        // Missing emailSubject and emailBody
      };

      await expect(service.upsertTemplate(tenantId, createDto)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw BusinessException if WhatsApp channel without whatsappBody', async () => {
      const createDto: CreateReminderTemplateDto = {
        stage: ReminderStage.FIRST,
        daysOverdue: 7,
        channels: [ReminderChannel.WHATSAPP],
        // Missing whatsappBody
      };

      await expect(service.upsertTemplate(tenantId, createDto)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should handle both channels with all content', async () => {
      const createDto: CreateReminderTemplateDto = {
        stage: ReminderStage.SECOND,
        daysOverdue: 14,
        channels: [ReminderChannel.EMAIL, ReminderChannel.WHATSAPP],
        emailSubject: 'Subject',
        emailBody: 'Email Body',
        whatsappBody: 'WhatsApp Body',
      };

      mockPrisma.reminderTemplate.upsert.mockResolvedValue({
        ...mockTemplate,
        stage: ReminderStage.SECOND,
        channels: createDto.channels,
        emailSubject: createDto.emailSubject,
        emailBody: createDto.emailBody,
        whatsappBody: createDto.whatsappBody,
      });

      const result = await service.upsertTemplate(tenantId, createDto);

      expect(result.channels).toEqual([
        ReminderChannel.EMAIL,
        ReminderChannel.WHATSAPP,
      ]);
      expect(result.whatsappBody).toBe('WhatsApp Body');
    });
  });

  describe('updateTemplate', () => {
    it('should update existing template', async () => {
      mockPrisma.reminderTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.reminderTemplate.update.mockResolvedValue({
        ...mockTemplate,
        daysOverdue: 10,
      });

      const updateDto: UpdateReminderTemplateDto = {
        daysOverdue: 10,
      };

      const result = await service.updateTemplate(
        'template-1',
        tenantId,
        updateDto,
      );

      expect(result.daysOverdue).toBe(10);
      expect(mockPrisma.reminderTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-1' },
        data: expect.objectContaining({
          daysOverdue: 10,
        }),
      });
    });

    it('should throw NotFoundException if template not found', async () => {
      mockPrisma.reminderTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTemplate('non-existent', tenantId, { daysOverdue: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template', async () => {
      mockPrisma.reminderTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.reminderTemplate.delete.mockResolvedValue(mockTemplate);

      await service.deleteTemplate('template-1', tenantId);

      expect(mockPrisma.reminderTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'template-1' },
      });
    });

    it('should throw NotFoundException if template not found', async () => {
      mockPrisma.reminderTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteTemplate('non-existent', tenantId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetToDefaults', () => {
    it('should delete all templates and seed defaults', async () => {
      mockPrisma.reminderTemplate.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.reminderTemplate.findUnique.mockResolvedValue(null);
      mockPrisma.reminderTemplate.create.mockImplementation((args) =>
        Promise.resolve({
          id: `template-${args.data.stage}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      await service.resetToDefaults(tenantId);

      expect(mockPrisma.reminderTemplate.deleteMany).toHaveBeenCalledWith({
        where: { tenantId },
      });

      // Should create 4 default templates (FIRST, SECOND, FINAL, ESCALATED)
      expect(mockPrisma.reminderTemplate.create).toHaveBeenCalledTimes(
        DEFAULT_TEMPLATES.length,
      );
    });
  });

  describe('seedDefaults', () => {
    it('should create missing templates', async () => {
      // All templates already exist except FINAL
      mockPrisma.reminderTemplate.findUnique
        .mockResolvedValueOnce(mockTemplate) // FIRST exists
        .mockResolvedValueOnce(mockTemplate) // SECOND exists
        .mockResolvedValueOnce(null) // FINAL doesn't exist
        .mockResolvedValueOnce(mockTemplate); // ESCALATED exists

      mockPrisma.reminderTemplate.create.mockResolvedValue({
        id: 'template-final',
        tenantId,
        stage: ReminderStage.FINAL,
        daysOverdue: 30,
        channels: [ReminderChannel.EMAIL, ReminderChannel.WHATSAPP],
        emailSubject: 'Final Subject',
        emailBody: 'Final Body',
        whatsappBody: 'Final WhatsApp',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.seedDefaults(tenantId);

      // Should only create 1 template (FINAL)
      expect(mockPrisma.reminderTemplate.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.reminderTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          stage: ReminderStage.FINAL,
        }),
      });
    });

    it('should not create any templates if all exist', async () => {
      mockPrisma.reminderTemplate.findUnique.mockResolvedValue(mockTemplate);

      await service.seedDefaults(tenantId);

      expect(mockPrisma.reminderTemplate.create).not.toHaveBeenCalled();
    });
  });

  describe('renderTemplate', () => {
    it('should replace all placeholders', () => {
      const template =
        'Dear {{parentName}}, Invoice {{invoiceNumber}} for {{childName}} is {{daysOverdue}} days overdue.';

      const variables = {
        parentName: 'John',
        childName: 'Emma',
        invoiceNumber: 'INV-001',
        amount: 'R1,500.00',
        dueDate: '15 January 2025',
        daysOverdue: '7',
        crecheName: 'Happy Kids',
        crechePhone: '011-123-4567',
        crecheEmail: 'info@happykids.co.za',
      };

      const result = service.renderTemplate(template, variables);

      expect(result).toBe(
        'Dear John, Invoice INV-001 for Emma is 7 days overdue.',
      );
    });

    it('should escape HTML by default', () => {
      const template = 'Hello {{parentName}}';

      const variables = {
        parentName: '<script>alert("xss")</script>',
        childName: 'Emma',
        invoiceNumber: 'INV-001',
        amount: 'R1,500.00',
        dueDate: '15 January 2025',
        daysOverdue: '7',
        crecheName: 'Happy Kids',
        crechePhone: '011-123-4567',
        crecheEmail: 'info@happykids.co.za',
      };

      const result = service.renderTemplate(template, variables);

      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should not escape HTML when disabled', () => {
      const template = 'Hello {{parentName}}';

      const variables = {
        parentName: '<b>John</b>',
        childName: 'Emma',
        invoiceNumber: 'INV-001',
        amount: 'R1,500.00',
        dueDate: '15 January 2025',
        daysOverdue: '7',
        crecheName: 'Happy Kids',
        crechePhone: '011-123-4567',
        crecheEmail: 'info@happykids.co.za',
      };

      const result = service.renderTemplate(template, variables, false);

      expect(result).toBe('Hello <b>John</b>');
    });

    it('should handle optional banking placeholders', () => {
      const template =
        'Pay to: {{bankName}} - {{accountNumber}} ({{branchCode}})';

      const variables = {
        parentName: 'John',
        childName: 'Emma',
        invoiceNumber: 'INV-001',
        amount: 'R1,500.00',
        dueDate: '15 January 2025',
        daysOverdue: '7',
        crecheName: 'Happy Kids',
        crechePhone: '011-123-4567',
        crecheEmail: 'info@happykids.co.za',
        bankName: 'FNB',
        accountNumber: '12345678',
        branchCode: '250655',
      };

      const result = service.renderTemplate(template, variables);

      expect(result).toBe('Pay to: FNB - 12345678 (250655)');
    });

    it('should replace empty optional values with empty string', () => {
      const template = 'Bank: {{bankName}}';

      const variables = {
        parentName: 'John',
        childName: 'Emma',
        invoiceNumber: 'INV-001',
        amount: 'R1,500.00',
        dueDate: '15 January 2025',
        daysOverdue: '7',
        crecheName: 'Happy Kids',
        crechePhone: '011-123-4567',
        crecheEmail: 'info@happykids.co.za',
        // No bankName provided
      };

      const result = service.renderTemplate(template, variables);

      expect(result).toBe('Bank: ');
    });
  });

  describe('getEffectiveTemplate', () => {
    it('should return custom template when exists', async () => {
      mockPrisma.reminderTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        emailSubject: 'Custom Subject',
        emailBody: 'Custom Body',
        whatsappBody: 'Custom WhatsApp',
      });

      const result = await service.getEffectiveTemplate(
        tenantId,
        ReminderStage.FIRST,
      );

      expect(result.isCustom).toBe(true);
      expect(result.emailSubject).toBe('Custom Subject');
    });

    it('should return default template when no custom exists', async () => {
      mockPrisma.reminderTemplate.findUnique.mockResolvedValue(null);

      const result = await service.getEffectiveTemplate(
        tenantId,
        ReminderStage.FIRST,
      );

      expect(result.isCustom).toBe(false);
      expect(result.daysOverdue).toBe(7);
      expect(result.channels).toContain(ReminderChannel.EMAIL);
    });

    it('should return default template when custom is inactive', async () => {
      mockPrisma.reminderTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        isActive: false,
      });

      const result = await service.getEffectiveTemplate(
        tenantId,
        ReminderStage.FIRST,
      );

      expect(result.isCustom).toBe(false);
    });
  });

  describe('DEFAULT_TEMPLATES', () => {
    it('should have 4 default templates', () => {
      expect(DEFAULT_TEMPLATES).toHaveLength(4);
    });

    it('should have correct stages', () => {
      const stages = DEFAULT_TEMPLATES.map((t) => t.stage);
      expect(stages).toContain(ReminderStage.FIRST);
      expect(stages).toContain(ReminderStage.SECOND);
      expect(stages).toContain(ReminderStage.FINAL);
      expect(stages).toContain(ReminderStage.ESCALATED);
    });

    it('should have correct days overdue', () => {
      const firstTemplate = DEFAULT_TEMPLATES.find(
        (t) => t.stage === ReminderStage.FIRST,
      );
      expect(firstTemplate?.daysOverdue).toBe(7);

      const secondTemplate = DEFAULT_TEMPLATES.find(
        (t) => t.stage === ReminderStage.SECOND,
      );
      expect(secondTemplate?.daysOverdue).toBe(14);

      const finalTemplate = DEFAULT_TEMPLATES.find(
        (t) => t.stage === ReminderStage.FINAL,
      );
      expect(finalTemplate?.daysOverdue).toBe(30);

      const escalatedTemplate = DEFAULT_TEMPLATES.find(
        (t) => t.stage === ReminderStage.ESCALATED,
      );
      expect(escalatedTemplate?.daysOverdue).toBe(45);
    });

    it('should have all required template placeholders', () => {
      for (const template of DEFAULT_TEMPLATES) {
        expect(template.emailBody).toContain('{{parentName}}');
        expect(template.emailBody).toContain('{{childName}}');
        expect(template.emailBody).toContain('{{invoiceNumber}}');
        expect(template.emailBody).toContain('{{amount}}');
        expect(template.emailBody).toContain('{{daysOverdue}}');
      }
    });

    it('should have email channel for all stages', () => {
      for (const template of DEFAULT_TEMPLATES) {
        expect(template.channels).toContain(ReminderChannel.EMAIL);
      }
    });

    it('should have WhatsApp channel for SECOND and FINAL stages', () => {
      const secondTemplate = DEFAULT_TEMPLATES.find(
        (t) => t.stage === ReminderStage.SECOND,
      );
      expect(secondTemplate?.channels).toContain(ReminderChannel.WHATSAPP);

      const finalTemplate = DEFAULT_TEMPLATES.find(
        (t) => t.stage === ReminderStage.FINAL,
      );
      expect(finalTemplate?.channels).toContain(ReminderChannel.WHATSAPP);
    });
  });
});
