import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

describe('CrecheBooks API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Health Endpoint', () => {
    it('GET /health returns status ok', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res: request.Response) => {
          const body = res.body as HealthResponse;
          expect(body.status).toBe('ok');
          expect(body.timestamp).toBeDefined();
          expect(body.uptime).toBeDefined();
          expect(typeof body.uptime).toBe('number');
        });
    });
  });
});
