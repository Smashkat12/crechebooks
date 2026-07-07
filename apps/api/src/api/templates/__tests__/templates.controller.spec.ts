/**
 * TemplatesController specs
 * TASK-TMPL-001: Tenant-Editable Message Templates
 *
 * Thin routing tests — full CRUD + audit + tenant-isolation behaviour is
 * covered in templates.service.spec.ts. Here we just prove the controller
 * forwards path params, query params, and body to the service correctly.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesController } from '../templates.controller';
import { TemplatesService } from '../templates.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { IUser } from '../../../database/entities/user.entity';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: {
    list: jest.Mock;
    findOne: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };

  const user: IUser = {
    id: 'user-1',
    tenantId: 'tenant-a',
    email: 'x@x.com',
    // Fields we don't care about but the type wants:
    role: 'ADMIN' as unknown as IUser['role'],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as IUser;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      findOne: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [{ provide: TemplatesService, useValue: service }],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TemplatesController);
  });

  it('list forwards the tenant + channel filter', async () => {
    service.list.mockResolvedValueOnce([]);
    await controller.list(user, { channel: 'EMAIL' as never });
    expect(service.list).toHaveBeenCalledWith('tenant-a', 'EMAIL');
  });

  it('findOne forwards the key + channel path params', async () => {
    service.findOne.mockResolvedValueOnce({});
    await controller.findOne(
      user,
      'ARREARS_REMINDER_FRIENDLY' as never,
      'EMAIL' as never,
    );
    expect(service.findOne).toHaveBeenCalledWith(
      'tenant-a',
      'ARREARS_REMINDER_FRIENDLY',
      'EMAIL',
    );
  });

  it('upsert passes the DTO through to the service with tenant + userId', async () => {
    service.upsert.mockResolvedValueOnce({});
    await controller.upsert(
      user,
      'ARREARS_REMINDER_FIRM' as never,
      'WHATSAPP' as never,
      { body: 'hello' },
    );
    expect(service.upsert).toHaveBeenCalledWith(
      'tenant-a',
      'user-1',
      'ARREARS_REMINDER_FIRM',
      'WHATSAPP',
      { body: 'hello' },
    );
  });

  it('delete calls the service revert', async () => {
    service.delete.mockResolvedValueOnce({});
    await controller.remove(
      user,
      'ARREARS_REMINDER_FINAL' as never,
      'WHATSAPP' as never,
    );
    expect(service.delete).toHaveBeenCalledWith(
      'tenant-a',
      'user-1',
      'ARREARS_REMINDER_FINAL',
      'WHATSAPP',
    );
  });
});
