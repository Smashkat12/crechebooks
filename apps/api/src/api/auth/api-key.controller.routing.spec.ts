import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './services/api-key.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Routing regression test for the API-key controller.
 *
 * main.ts applies a global 'api/v1' prefix (app.setGlobalPrefix('api/v1')), so
 * the controller path MUST be relative — '@Controller('auth/api-keys')'. A prior
 * bug used '@Controller('api/v1/auth/api-keys')', which doubled the prefix and
 * served the routes at /api/v1/api/v1/auth/api-keys; the real /api/v1/auth/api-keys
 * (what the web UI and CLI call) returned 404, breaking all key management.
 *
 * This test sets the global prefix exactly like main.ts so the doubling would
 * reproduce. (The default e2e bootstrap does NOT set the prefix — which is why
 * the bug went undetected.) Auth is denied so a *registered* route returns 403,
 * letting us distinguish "route exists" (403) from "wrong path" (404).
 */
describe('ApiKeyController routing (global api/v1 prefix)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeyController],
      providers: [{ provide: ApiKeyService, useValue: {} }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => false })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1'); // mirror main.ts
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves key management at /api/v1/auth/api-keys (route exists → 403, not 404)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/api-keys');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(403);
  });

  it('does NOT serve at the doubled /api/v1/api/v1/auth/api-keys', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/api/v1/auth/api-keys',
    );
    expect(res.status).toBe(404);
  });
});
