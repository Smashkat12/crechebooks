import { Test, TestingModule } from '@nestjs/testing';
import { CommsGuardService } from './comms-guard.service';

describe('CommsGuardService', () => {
  const buildService = async (
    commsDisabled?: string,
  ): Promise<CommsGuardService> => {
    if (commsDisabled !== undefined) {
      process.env.COMMS_DISABLED = commsDisabled;
    } else {
      delete process.env.COMMS_DISABLED;
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [CommsGuardService],
    }).compile();

    return module.get<CommsGuardService>(CommsGuardService);
  };

  afterEach(() => {
    delete process.env.COMMS_DISABLED;
  });

  it('returns false when COMMS_DISABLED is not set', async () => {
    const service = await buildService();
    expect(service.isDisabled()).toBe(false);
  });

  it('returns false when COMMS_DISABLED=false', async () => {
    const service = await buildService('false');
    expect(service.isDisabled()).toBe(false);
  });

  it('returns true when COMMS_DISABLED=true', async () => {
    const service = await buildService('true');
    expect(service.isDisabled()).toBe(true);
  });

  it('is case-insensitive — TRUE activates the flag', async () => {
    const service = await buildService('TRUE');
    expect(service.isDisabled()).toBe(true);
  });
});
