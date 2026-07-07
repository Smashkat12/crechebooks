/**
 * MessageTemplateResolverService specs
 * TASK-TMPL-001: Tenant-Editable Message Templates
 */

import { Test, TestingModule } from '@nestjs/testing';
import { MessageTemplateResolverService } from '../message-template-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MessageTemplateResolverService', () => {
  let service: MessageTemplateResolverService;
  let prisma: { messageTemplate: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      messageTemplate: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageTemplateResolverService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MessageTemplateResolverService);
  });

  describe('resolve', () => {
    it('returns the tenant override when one exists', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce({
        id: 'row-1',
        tenantId: 't1',
        key: 'ARREARS_REMINDER_FRIENDLY',
        channel: 'EMAIL',
        subject: 'Custom subject {parentName}',
        body: 'Custom body {parentName}',
        isDefault: false,
      });

      const resolved = await service.resolve(
        't1',
        'ARREARS_REMINDER_FRIENDLY',
        'EMAIL',
      );

      expect(resolved).toEqual({
        key: 'ARREARS_REMINDER_FRIENDLY',
        channel: 'EMAIL',
        subject: 'Custom subject {parentName}',
        body: 'Custom body {parentName}',
        isCustom: true,
      });
    });

    it('falls back to the coded default when no override exists', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce(null);

      const resolved = await service.resolve(
        't1',
        'ARREARS_REMINDER_FRIENDLY',
        'EMAIL',
      );

      expect(resolved).not.toBeNull();
      expect(resolved!.isCustom).toBe(false);
      expect(resolved!.subject).toContain('Friendly Reminder');
      expect(resolved!.body).toContain('{parentName}');
    });

    it('returns null when there is no default for the key/channel pair', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce(null);

      // INVOICE_DELIVERY has no WHATSAPP default
      const resolved = await service.resolve(
        't1',
        'INVOICE_DELIVERY',
        'WHATSAPP',
      );

      expect(resolved).toBeNull();
    });

    it('falls back to defaults when the DB query throws (migration not run)', async () => {
      prisma.messageTemplate.findUnique.mockRejectedValueOnce(
        new Error('relation "message_templates" does not exist'),
      );

      const resolved = await service.resolve(
        't1',
        'ARREARS_REMINDER_FRIENDLY',
        'EMAIL',
      );

      expect(resolved).not.toBeNull();
      expect(resolved!.isCustom).toBe(false);
    });

    it('scopes the query to the caller tenant', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce(null);
      await service.resolve('tenant-abc', 'ARREARS_REMINDER_FIRM', 'EMAIL');
      expect(prisma.messageTemplate.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_key_channel: {
            tenantId: 'tenant-abc',
            key: 'ARREARS_REMINDER_FIRM',
            channel: 'EMAIL',
          },
        },
      });
    });
  });

  describe('resolveAndRender', () => {
    it('substitutes placeholders in subject and body', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce({
        id: 'row-2',
        tenantId: 't1',
        key: 'ARREARS_REMINDER_FIRM',
        channel: 'EMAIL',
        subject: 'Hello {parentName}',
        body: 'Owe {amount} for {childName}',
        isDefault: false,
      });

      const rendered = await service.resolveAndRender(
        't1',
        'ARREARS_REMINDER_FIRM',
        'EMAIL',
        {
          parentName: 'Alice',
          amount: 'R1,000.00',
          childName: 'Bob',
        },
      );

      expect(rendered).toEqual({
        key: 'ARREARS_REMINDER_FIRM',
        channel: 'EMAIL',
        subject: 'Hello Alice',
        body: 'Owe R1,000.00 for Bob',
        isCustom: true,
      });
    });

    it('leaves unknown placeholders unchanged (matches legacy behaviour)', () => {
      const out = service.renderString('Hi {unknown} {parentName}', {
        parentName: 'Alice',
      });
      expect(out).toBe('Hi {unknown} Alice');
    });

    it('coerces null/undefined values to empty string', () => {
      const out = service.renderString('a={a} b={b} c={c}', {
        a: 'x',
        b: null,
        c: undefined,
      });
      expect(out).toBe('a=x b= c=');
    });

    it('returns null when neither override nor default exists', async () => {
      prisma.messageTemplate.findUnique.mockResolvedValueOnce(null);
      const rendered = await service.resolveAndRender(
        't1',
        'INVOICE_DELIVERY',
        'WHATSAPP',
        {},
      );
      expect(rendered).toBeNull();
    });
  });
});
