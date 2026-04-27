/**
 * EmailService — COMMS_DISABLED flag behaviour
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService, EmailOptions } from './email.service';
import { CommsGuardService } from '../../common/services/comms-guard/comms-guard.service';

const buildService = async (disabled: boolean): Promise<EmailService> => {
  const commsGuardMock: Partial<CommsGuardService> = {
    isDisabled: jest.fn().mockReturnValue(disabled),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      EmailService,
      { provide: CommsGuardService, useValue: commsGuardMock },
    ],
  }).compile();

  return module.get<EmailService>(EmailService);
};

const sampleOptions: EmailOptions = {
  to: 'parent@example.com',
  subject: 'Invoice',
  body: 'Body text',
};

describe('EmailService — CommsGuard', () => {
  it('returns a no-op result without sending when COMMS_DISABLED=true', async () => {
    const service = await buildService(true);

    const result = await service.sendEmailWithOptions(sampleOptions);

    expect(result.status).toBe('sent');
    expect(result.messageId).toBe('comms-disabled-noop');
  });

  it('also no-ops via the simple sendEmail wrapper when COMMS_DISABLED=true', async () => {
    const service = await buildService(true);

    const result = await service.sendEmail(
      'parent@example.com',
      'Invoice',
      'Body',
    );

    expect(result.status).toBe('sent');
    expect(result.messageId).toBe('comms-disabled-noop');
  });

  it('proceeds to normal flow when COMMS_DISABLED=false (no provider configured — throws)', async () => {
    const service = await buildService(false);

    // No provider configured in unit test — BusinessException is expected
    await expect(service.sendEmailWithOptions(sampleOptions)).rejects.toThrow();
  });
});
