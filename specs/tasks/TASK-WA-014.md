<task_spec id="TASK-WA-014" version="2.0">

<metadata>
  <title>WhatsApp Onboarding Admin Visibility and Tests</title>
  <status>pending</status>
  <phase>28</phase>
  <layer>surface</layer>
  <sequence>716</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-ONBOARD-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="pending">TASK-WA-012</task_ref>
    <task_ref status="pending">TASK-WA-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Admins have no visibility into ongoing WhatsApp onboarding sessions
  - No API endpoint to list/view onboarding sessions
  - No admin notification when a parent completes onboarding
  - No way for admin to approve/reject onboarding and create enrollment
  - No E2E tests for the full onboarding flow

  **Existing Resources:**
  - WhatsAppOnboardingSession model (TASK-WA-011)
  - OnboardingConversationHandler (TASK-WA-012)
  - Admin Portal pages (TASK-ADMIN-*)
  - Existing enrollment management (TASK-BILL-011)
  - Notification service (TASK-NOTIF-001)

  **Gap:**
  - No OnboardingController (API endpoints)
  - No DTOs for onboarding session listing/detail
  - No admin notification on completion
  - No "Convert to Enrollment" action
  - No E2E test for full conversation flow

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/controllers/onboarding.controller.ts`
  - `apps/api/src/integrations/whatsapp/dto/onboarding.dto.ts`
  - `apps/api/src/integrations/whatsapp/controllers/onboarding.controller.spec.ts`
  - `apps/api/test/whatsapp-onboarding.e2e-spec.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts` — add admin notification
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register controller
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Onboarding Controller
  ```typescript
  // apps/api/src/integrations/whatsapp/controllers/onboarding.controller.ts

  @ApiTags('whatsapp-onboarding')
  @Controller('whatsapp/onboarding')
  @UseGuards(JwtAuthGuard, TenantGuard)
  export class OnboardingController {
    constructor(
      private readonly prisma: PrismaService,
      private readonly enrollmentService: EnrollmentService,
    ) {}

    /**
     * GET /whatsapp/onboarding
     * List all onboarding sessions for the tenant
     */
    @Get()
    @ApiQuery({ name: 'status', required: false, enum: ['IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED'] })
    async listSessions(
      @TenantId() tenantId: string,
      @Query() query: ListOnboardingDto,
    ): Promise<OnboardingSessionListDto[]> {
      return this.prisma.whatsAppOnboardingSession.findMany({
        where: {
          tenantId,
          ...(query.status && { status: query.status }),
        },
        orderBy: { updatedAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      });
    }

    /**
     * GET /whatsapp/onboarding/:id
     * Get detailed onboarding session with collected data
     */
    @Get(':id')
    async getSession(
      @TenantId() tenantId: string,
      @Param('id') id: string,
    ): Promise<OnboardingSessionDetailDto> {
      const session = await this.prisma.whatsAppOnboardingSession.findFirst({
        where: { id, tenantId },
        include: { parent: true },
      });
      if (!session) throw new NotFoundException('Onboarding session not found');
      return session;
    }

    /**
     * POST /whatsapp/onboarding/:id/enroll
     * Convert completed onboarding to enrollment
     */
    @Post(':id/enroll')
    async convertToEnrollment(
      @TenantId() tenantId: string,
      @Param('id') id: string,
      @Body() body: CreateEnrollmentFromOnboardingDto,
    ): Promise<{ enrollmentId: string }> {
      const session = await this.prisma.whatsAppOnboardingSession.findFirst({
        where: { id, tenantId, status: 'COMPLETED' },
      });
      if (!session) throw new NotFoundException('Completed onboarding session not found');

      const data = session.collectedData as OnboardingCollectedData;

      // Create enrollment via existing service
      const enrollment = await this.enrollmentService.create({
        tenantId,
        parentId: session.parentId,
        childId: body.childId,  // Admin selects which child
        feeStructureId: body.feeStructureId,
        startDate: body.startDate,
      });

      return { enrollmentId: enrollment.id };
    }

    /**
     * GET /whatsapp/onboarding/stats
     * Dashboard statistics for onboarding
     */
    @Get('stats')
    async getStats(@TenantId() tenantId: string): Promise<OnboardingStatsDto> {
      const [total, inProgress, completed, abandoned] = await Promise.all([
        this.prisma.whatsAppOnboardingSession.count({ where: { tenantId } }),
        this.prisma.whatsAppOnboardingSession.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
        this.prisma.whatsAppOnboardingSession.count({ where: { tenantId, status: 'COMPLETED' } }),
        this.prisma.whatsAppOnboardingSession.count({ where: { tenantId, status: 'ABANDONED' } }),
      ]);

      return {
        total,
        inProgress,
        completed,
        abandoned,
        conversionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    }
  }
  ```

  ### 2. DTOs
  ```typescript
  // apps/api/src/integrations/whatsapp/dto/onboarding.dto.ts

  export class ListOnboardingDto {
    @IsOptional()
    @IsEnum(['IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED'])
    status?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    offset?: number;
  }

  export class CreateEnrollmentFromOnboardingDto {
    @IsString()
    childId: string;

    @IsString()
    feeStructureId: string;

    @IsDateString()
    startDate: string;
  }

  export class OnboardingStatsDto {
    total: number;
    inProgress: number;
    completed: number;
    abandoned: number;
    conversionRate: number;
  }
  ```

  ### 3. Admin Notification on Completion
  ```typescript
  // In onboarding-conversation.handler.ts completeOnboarding():

  // Notify admin users via email
  const admins = await this.prisma.user.findMany({
    where: { tenantId, role: { in: ['ADMIN', 'OWNER'] } },
    select: { email: true, firstName: true },
  });

  for (const admin of admins) {
    await this.notificationService.sendEmail({
      to: admin.email,
      subject: `New WhatsApp Registration: ${data.parent.firstName} ${data.parent.surname}`,
      template: 'onboarding-complete',
      data: {
        adminName: admin.firstName,
        parentName: `${data.parent.firstName} ${data.parent.surname}`,
        childCount: data.children?.length || 1,
        phone: session.waId,
        tenantName: tenant.tradingName,
      },
    });
  }
  ```

  ### 4. E2E Test
  ```typescript
  // apps/api/test/whatsapp-onboarding.e2e-spec.ts

  describe('WhatsApp Onboarding E2E', () => {
    it('should complete full onboarding flow', async () => {
      // Simulate webhook callbacks for each step
      const waId = '+27821234567';

      // Step 1: Trigger with "enroll"
      await sendWebhook({ From: waId, Body: 'I want to enroll my child' });

      // Step 2: Accept POPIA consent
      await sendWebhook({ From: waId, Body: 'accept' });

      // Step 3-6: Parent details
      await sendWebhook({ From: waId, Body: 'Sarah' });
      await sendWebhook({ From: waId, Body: 'Smith' });
      await sendWebhook({ From: waId, Body: 'sarah@example.com' });
      await sendWebhook({ From: waId, Body: 'Skip' }); // SA ID optional

      // Step 7-9: Child details
      await sendWebhook({ From: waId, Body: 'Emma' });
      await sendWebhook({ From: waId, Body: '15/03/2022' });
      await sendWebhook({ From: waId, Body: 'None' });

      // Step 10-12: Emergency contact
      await sendWebhook({ From: waId, Body: 'John Smith' });
      await sendWebhook({ From: waId, Body: '0821234568' });
      await sendWebhook({ From: waId, Body: 'parent' });

      // Step 13: Skip ID document
      await sendWebhook({ From: waId, Body: 'Skip' });

      // Step 14: Acknowledge fees
      await sendWebhook({ From: waId, Body: 'agree' });

      // Step 15: Communication prefs
      await sendWebhook({ From: waId, Body: 'both' });

      // Step 16: Confirm
      await sendWebhook({ From: waId, Body: 'confirm' });

      // Verify records created
      const parent = await prisma.parent.findFirst({
        where: { email: 'sarah@example.com' },
        include: { children: true },
      });

      expect(parent).toBeDefined();
      expect(parent.firstName).toBe('Sarah');
      expect(parent.lastName).toBe('Smith');
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0].firstName).toBe('Emma');

      const session = await prisma.whatsAppOnboardingSession.findFirst({
        where: { waId },
      });
      expect(session.status).toBe('COMPLETED');
    });

    it('should validate SA ID with Luhn check', async () => {
      // ... test invalid ID
    });

    it('should handle multi-child registration', async () => {
      // ... test adding 2 children
    });

    it('should resume abandoned session', async () => {
      // ... test re-engagement flow
    });
  });
  ```
</critical_patterns>

<scope>
  <in_scope>
    - OnboardingController with CRUD endpoints
    - DTOs with validation
    - Admin notification on onboarding completion
    - "Convert to Enrollment" endpoint
    - Onboarding statistics endpoint
    - E2E test for full onboarding flow
    - E2E test for validation edge cases
    - E2E test for multi-child flow
    - E2E test for session resume
  </in_scope>
  <out_of_scope>
    - Admin Portal UI components (future task for web app)
    - Real-time WebSocket notifications
    - Bulk enrollment creation
    - WhatsApp Flows (Phase 2)
    - SMS fallback for non-WhatsApp users
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create controller and DTOs
# Create apps/api/src/integrations/whatsapp/controllers/onboarding.controller.ts
# Create apps/api/src/integrations/whatsapp/dto/onboarding.dto.ts

# 2. Create tests
# Create controller spec and E2E test

# 3. Update module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 4. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
pnpm test:e2e -- --grep "WhatsApp Onboarding"
```
</verification_commands>

<definition_of_done>
  - [ ] OnboardingController with GET /list, GET /:id, POST /:id/enroll, GET /stats
  - [ ] ListOnboardingDto with status filter and pagination
  - [ ] CreateEnrollmentFromOnboardingDto with validation
  - [ ] OnboardingStatsDto with conversion rate
  - [ ] Admin email notification on onboarding completion
  - [ ] Convert-to-enrollment endpoint using existing EnrollmentService
  - [ ] Controller unit tests
  - [ ] E2E test: full onboarding flow (16 steps)
  - [ ] E2E test: SA ID validation
  - [ ] E2E test: multi-child registration
  - [ ] E2E test: session resume after expiry
  - [ ] Tenant isolation enforced in all endpoints
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
