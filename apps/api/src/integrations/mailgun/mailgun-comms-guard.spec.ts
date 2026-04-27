/**
 * MailgunService — COMMS_DISABLED flag behaviour
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MailgunService, MailgunEmailOptions } from './mailgun.service';
import { CommsGuardService } from '../../common/services/comms-guard/comms-guard.service';

const buildService = async (disabled: boolean): Promise<MailgunService> => {
  const commsGuardMock: Partial<CommsGuardService> = {
    isDisabled: jest.fn().mockReturnValue(disabled),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MailgunService,
      { provide: CommsGuardService, useValue: commsGuardMock },
    ],
  }).compile();

  return module.get<MailgunService>(MailgunService);
};

const sampleOptions: MailgunEmailOptions = {
  to: 'parent@example.com',
  subject: 'Invoice Due',
  text: 'You have an outstanding invoice.',
};

describe('MailgunService — CommsGuard', () => {
  it('returns a no-op result without calling Mailgun when COMMS_DISABLED=true', async () => {
    const service = await buildService(true);

    const result = await service.sendEmail(sampleOptions);

    expect(result.status).toBe('queued');
    expect(result.id).toBe('comms-disabled-noop');
  });

  it('proceeds to normal flow when COMMS_DISABLED=false (client not configured — throws)', async () => {
    const service = await buildService(false);

    // Client is not initialized in unit test — BusinessException is expected
    await expect(service.sendEmail(sampleOptions)).rejects.toThrow();
  });
});
