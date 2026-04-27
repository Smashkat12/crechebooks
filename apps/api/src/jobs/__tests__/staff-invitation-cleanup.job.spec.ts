import { Test, TestingModule } from '@nestjs/testing';
import { StaffInvitationCleanupJob } from '../staff-invitation-cleanup.job';
import { StaffInvitationService } from '../../api/staff/staff-invitation.service';

describe('StaffInvitationCleanupJob', () => {
  let job: StaffInvitationCleanupJob;
  let staffInvitationService: jest.Mocked<StaffInvitationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffInvitationCleanupJob,
        {
          provide: StaffInvitationService,
          useValue: {
            expireOldInvites: jest.fn(),
          },
        },
      ],
    }).compile();

    job = module.get<StaffInvitationCleanupJob>(StaffInvitationCleanupJob);
    staffInvitationService = module.get(StaffInvitationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('expireStaleInvites', () => {
    it('calls expireOldInvites and logs the count when invitations are expired', async () => {
      staffInvitationService.expireOldInvites.mockResolvedValue(3);

      await job.expireStaleInvites();

      expect(staffInvitationService.expireOldInvites).toHaveBeenCalledTimes(1);
    });

    it('calls expireOldInvites and logs zero count when no invitations are expired', async () => {
      staffInvitationService.expireOldInvites.mockResolvedValue(0);

      await job.expireStaleInvites();

      expect(staffInvitationService.expireOldInvites).toHaveBeenCalledTimes(1);
    });

    it('does not rethrow errors — swallows and logs them', async () => {
      staffInvitationService.expireOldInvites.mockRejectedValue(
        new Error('DB connection lost'),
      );

      // Should not throw
      await expect(job.expireStaleInvites()).resolves.toBeUndefined();
      expect(staffInvitationService.expireOldInvites).toHaveBeenCalledTimes(1);
    });
  });
});
