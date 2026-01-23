import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../apps/api/src/database/prisma';
import { PublicModule } from '../../apps/api/src/api/public/public.module';
import { ThrottlerModule } from '@nestjs/throttler';

describe('Public API Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PublicModule,
        ThrottlerModule.forRoot({
          throttlers: [
            {
              ttl: 60000,
              limit: 100,
            },
          ],
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/public/contact', () => {
    it('should create a contact submission successfully', async () => {
      const contactDto = {
        name: 'John Smith',
        email: 'john@example.com',
        phone: '+27821234567',
        subject: 'Pricing inquiry',
        message: 'I would like to know about your pricing plans.',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/public/contact')
        .send(contactDto)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('submissionId');

      // Verify database entry
      const submission = await prisma.contactSubmission.findUnique({
        where: { id: response.body.submissionId },
      });

      expect(submission).toBeDefined();
      expect(submission?.email).toBe(contactDto.email);
      expect(submission?.status).toBe('PENDING');

      // Cleanup
      await prisma.contactSubmission.delete({
        where: { id: response.body.submissionId },
      });
    });

    it('should reject invalid email', async () => {
      const contactDto = {
        name: 'John Smith',
        email: 'invalid-email',
        subject: 'Test',
        message: 'Test message',
      };

      await request(app.getHttpServer())
        .post('/api/v1/public/contact')
        .send(contactDto)
        .expect(400);
    });

    it('should sanitize input data', async () => {
      const contactDto = {
        name: 'John <script>alert("xss")</script> Smith',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'Test message',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/public/contact')
        .send(contactDto)
        .expect(200);

      const submission = await prisma.contactSubmission.findUnique({
        where: { id: response.body.submissionId },
      });

      expect(submission?.name).not.toContain('<script>');

      // Cleanup
      await prisma.contactSubmission.delete({
        where: { id: response.body.submissionId },
      });
    });
  });

  describe('POST /api/v1/public/demo-request', () => {
    it('should create a demo request successfully', async () => {
      const demoDto = {
        fullName: 'Sarah Johnson',
        email: 'sarah@littlelearners.co.za',
        phone: '+27821234567',
        crecheName: 'Little Learners Daycare',
        childrenCount: 45,
        province: 'Gauteng',
        currentSoftware: 'Excel',
        challenges: ['Manual invoicing', 'Payment tracking'],
        preferredTime: 'AFTERNOON',
        marketingConsent: true,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/public/demo-request')
        .send(demoDto)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('requestId');

      // Verify database entry
      const demoRequest = await prisma.demoRequest.findUnique({
        where: { id: response.body.requestId },
      });

      expect(demoRequest).toBeDefined();
      expect(demoRequest?.childrenCount).toBe(45);
      expect(demoRequest?.challenges).toEqual(['Manual invoicing', 'Payment tracking']);
      expect(demoRequest?.status).toBe('PENDING');

      // Cleanup
      await prisma.demoRequest.delete({
        where: { id: response.body.requestId },
      });
    });

    it('should validate childrenCount range', async () => {
      const demoDto = {
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '+27821234567',
        crecheName: 'Test Daycare',
        childrenCount: 2000, // Exceeds max of 1000
        province: 'Gauteng',
        marketingConsent: true,
      };

      await request(app.getHttpServer())
        .post('/api/v1/public/demo-request')
        .send(demoDto)
        .expect(400);
    });
  });

  describe('POST /api/v1/public/signup', () => {
    it('should create trial account successfully', async () => {
      const signupDto = {
        crecheName: 'Test Creche',
        adminName: 'Admin User',
        adminEmail: `test-${Date.now()}@example.com`,
        password: 'SecurePass123!',
        phone: '+27821234567',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/public/signup')
        .send(signupDto)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('tenantId');
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('trialExpiresAt');

      // Verify tenant creation
      const tenant = await prisma.tenant.findUnique({
        where: { id: response.body.tenantId },
      });

      expect(tenant).toBeDefined();
      expect(tenant?.subscriptionStatus).toBe('TRIAL');
      expect(tenant?.name).toBe(signupDto.crecheName);

      // Verify user creation
      const user = await prisma.user.findUnique({
        where: { id: response.body.userId },
      });

      expect(user).toBeDefined();
      expect(user?.role).toBe('ADMIN');
      expect(user?.email).toBe(signupDto.adminEmail);

      // Cleanup
      await prisma.userTenantRole.deleteMany({
        where: { tenantId: response.body.tenantId },
      });
      await prisma.user.delete({
        where: { id: response.body.userId },
      });
      await prisma.tenant.delete({
        where: { id: response.body.tenantId },
      });
    });

    it('should reject weak passwords', async () => {
      const signupDto = {
        crecheName: 'Test Creche',
        adminName: 'Admin User',
        adminEmail: 'test@example.com',
        password: 'weak', // Too weak
        phone: '+27821234567',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
      };

      await request(app.getHttpServer())
        .post('/api/v1/public/signup')
        .send(signupDto)
        .expect(400);
    });

    it('should prevent duplicate email signups', async () => {
      const signupDto = {
        crecheName: 'Test Creche',
        adminName: 'Admin User',
        adminEmail: `duplicate-${Date.now()}@example.com`,
        password: 'SecurePass123!',
        phone: '+27821234567',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
      };

      // First signup
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/public/signup')
        .send(signupDto)
        .expect(201);

      // Second signup with same email
      await request(app.getHttpServer())
        .post('/api/v1/public/signup')
        .send(signupDto)
        .expect(409);

      // Cleanup
      await prisma.userTenantRole.deleteMany({
        where: { tenantId: response1.body.tenantId },
      });
      await prisma.user.delete({
        where: { id: response1.body.userId },
      });
      await prisma.tenant.delete({
        where: { id: response1.body.tenantId },
      });
    });
  });
});
