/**
 * TwilioWhatsAppService — COMMS_DISABLED flag behaviour
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TwilioWhatsAppService } from '../services/twilio-whatsapp.service';
import { CommsGuardService } from '../../../common/services/comms-guard/comms-guard.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';

const buildService = async (
  disabled: boolean,
): Promise<TwilioWhatsAppService> => {
  const commsGuardMock: Partial<CommsGuardService> = {
    isDisabled: jest.fn().mockReturnValue(disabled),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TwilioWhatsAppService,
      { provide: CommsGuardService, useValue: commsGuardMock },
      {
        provide: PrismaService,
        useValue: {},
      },
      {
        provide: AuditLogService,
        useValue: {},
      },
    ],
  }).compile();

  return module.get<TwilioWhatsAppService>(TwilioWhatsAppService);
};

describe('TwilioWhatsAppService — CommsGuard', () => {
  it('returns a no-op success result without calling Twilio when COMMS_DISABLED=true', async () => {
    const service = await buildService(true);

    const result = await service.sendMessage(
      '+27821234567',
      'Your invoice is due.',
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('comms-disabled-noop');
  });

  it('proceeds past guard when COMMS_DISABLED=false (Twilio not configured — throws)', async () => {
    const service = await buildService(false);

    // Twilio env vars not set in unit test — ensureConfigured() throws BusinessException
    await expect(
      service.sendMessage('+27821234567', 'Your invoice is due.'),
    ).rejects.toThrow();
  });
});
