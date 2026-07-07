/**
 * TemplatesService specs
 * TASK-TMPL-001: Tenant-Editable Message Templates
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TemplatesService } from '../templates.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { MessageTemplateResolverService } from '../../../database/services/message-template-resolver.service';
import { AuditAction } from '../../../database/entities/audit-log.entity';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let prisma: {
    messageTemplate: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };
  let auditLog: { logAction: jest.Mock };

  const tenantA = 'tenant-a';
  const tenantB = 'tenant-b';
  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      messageTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };
    auditLog = { logAction: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        {
          provide: MessageTemplateResolverService,
          useValue: { listDefaults: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(TemplatesService);
  });

  describe('list', () => {
    it('merges overrides with coded defaults (defaults appear with isDefault:true, id:null)', async () => {
      prisma.messageTemplate.findMany.mockResolvedValueOnce([]);

      const rows = await service.list(tenantA);

      // Should include ALL defaults (10 total across keys/channels)
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.isDefault).toBe(true);
        expect(row.id).toBeNull();
        expect(row.tenantId).toBe(tenantA);
      }
    });

    it('surfaces the override in place of the default when tenant has customized', async () => {
      prisma.messageTemplate.findMany.mockResolvedValueOnce([
        {
          id: 'row-1',
          tenantId: tenantA,
          key: 'ARREARS_REMINDER_FRIENDLY',
          channel: 'EMAIL',
          subject: 'MY subject {parentName}',
          body: 'MY body',
          isDefault: false,
          createdAt: new Date('2026-07-01'),
          updatedAt: new Date('2026-07-01'),
        },
      ]);

      const rows = await service.list(tenantA);
      const friendly = rows.find(
        (r) => r.key === 'ARREARS_REMINDER_FRIENDLY' && r.channel === 'EMAIL',
      );

      expect(friendly).toBeDefined();
      expect(friendly!.id).toBe('row-1');
      expect(friendly!.isDefault).toBe(false);
      expect(friendly!.subject).toBe('MY subject {parentName}');
      expect(friendly!.body).toBe('MY body');
    });

    it('applies the channel filter to both overrides AND defaults', async () => {
      prisma.messageTemplate.findMany.mockResolvedValueOnce([]);

      const rows = await service.list(tenantA, 'WHATSAPP');

      expect(prisma.messageTemplate.findMany).toHaveBeenCalledWith({
        where: { tenantId: tenantA, channel: 'WHATSAPP' },
      });
      for (const row of rows) {
        expect(row.channel).toBe('WHATSAPP');
      }
    });

    it('scopes reads to the caller tenant', async () => {
      prisma.messageTemplate.findMany.mockResolvedValueOnce([]);
      await service.list(tenantB);
      expect(prisma.messageTemplate.findMany).toHaveBeenCalledWith({
        where: { tenantId: tenantB },
      });
    });
  });

  describe('upsert', () => {
    it('creates a row and writes a CREATE audit log when no override exists', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce(null);
      prisma.messageTemplate.upsert.mockResolvedValueOnce({
        id: 'row-new',
        tenantId: tenantA,
        key: 'ARREARS_REMINDER_FIRM',
        channel: 'EMAIL',
        subject: 'New subj',
        body: 'New body',
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.upsert(
        tenantA,
        userId,
        'ARREARS_REMINDER_FIRM',
        'EMAIL',
        { subject: 'New subj', body: 'New body' },
      );

      expect(auditLog.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenantA,
          userId,
          entityType: 'MessageTemplate',
          action: AuditAction.CREATE,
          afterValue: { subject: 'New subj', body: 'New body' },
        }),
      );
      expect(prisma.messageTemplate.upsert).toHaveBeenCalled();
    });

    it('updates a row and writes an UPDATE audit log with beforeValue', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce({
        id: 'row-existing',
        tenantId: tenantA,
        key: 'ARREARS_REMINDER_FIRM',
        channel: 'EMAIL',
        subject: 'Old subj',
        body: 'Old body',
        isDefault: false,
      });
      prisma.messageTemplate.upsert.mockResolvedValueOnce({
        id: 'row-existing',
        tenantId: tenantA,
        key: 'ARREARS_REMINDER_FIRM',
        channel: 'EMAIL',
        subject: 'New subj',
        body: 'New body',
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.upsert(
        tenantA,
        userId,
        'ARREARS_REMINDER_FIRM',
        'EMAIL',
        { subject: 'New subj', body: 'New body' },
      );

      expect(auditLog.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          beforeValue: { subject: 'Old subj', body: 'Old body' },
          afterValue: { subject: 'New subj', body: 'New body' },
        }),
      );
    });

    it('rejects unknown key/channel combinations', async () => {
      await expect(
        service.upsert(
          tenantA,
          userId,
          // @ts-expect-error deliberately invalid key literal
          'NOT_A_REAL_KEY',
          'EMAIL',
          { body: 'x' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete (revert to default)', () => {
    it('deletes the override, writes an audit log, and returns the coded default', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce({
        id: 'row-x',
        tenantId: tenantA,
        key: 'ARREARS_REMINDER_FINAL',
        channel: 'WHATSAPP',
        subject: null,
        body: 'Custom body',
        isDefault: false,
      });
      prisma.messageTemplate.delete.mockResolvedValueOnce({ id: 'row-x' });

      const result = await service.delete(
        tenantA,
        userId,
        'ARREARS_REMINDER_FINAL',
        'WHATSAPP',
      );

      expect(prisma.messageTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'row-x' },
      });
      expect(auditLog.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DELETE,
          beforeValue: { subject: null, body: 'Custom body' },
        }),
      );
      // Returned row is the coded default (id null, isDefault true)
      expect(result.id).toBeNull();
      expect(result.isDefault).toBe(true);
      expect(result.body).toContain('FINAL NOTICE');
    });

    it('is a no-op when no override exists — still returns the default without audit', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce(null);

      const result = await service.delete(
        tenantA,
        userId,
        'ARREARS_REMINDER_FINAL',
        'WHATSAPP',
      );

      expect(prisma.messageTemplate.delete).not.toHaveBeenCalled();
      expect(auditLog.logAction).not.toHaveBeenCalled();
      expect(result.isDefault).toBe(true);
      expect(result.id).toBeNull();
    });
  });
});
