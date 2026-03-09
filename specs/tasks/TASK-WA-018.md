<task_spec id="TASK-WA-018" version="2.0">

<metadata>
  <title>WhatsApp Flows Deployment, Testing and Migration</title>
  <status>pending</status>
  <phase>29</phase>
  <layer>integration</layer>
  <sequence>720</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-FLOWS-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="pending">TASK-WA-016</task_ref>
    <task_ref status="pending">TASK-WA-017</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Flow definition exists but has not been deployed to WhatsApp/Meta
  - No E2E test for the full Flows onboarding path
  - No migration path from Phase 1 (conversational) to Phase 2 (Flows)
  - No monitoring for Flow completion rates vs conversational
  - No error handling for Flow API failures

  **Existing Resources:**
  - WhatsAppFlowsService (TASK-WA-015) — API integration
  - Onboarding flow definition (TASK-WA-016) — 5-screen form
  - FlowsOnboardingProcessor (TASK-WA-017) — data processing
  - OnboardingController stats endpoint (TASK-WA-014) — dashboard
  - register-whatsapp-templates.ts (existing) — pattern for registration script

  **Gap:**
  - No deployment script for Flows
  - No E2E tests simulating Flow webhook callbacks
  - No monitoring/metrics for Flow vs conversational completion
  - No error recovery if Flow API is unavailable
  - No Prisma migration for tenant.whatsappFlowsEnabled

  **Files to Create:**
  - `apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_whatsapp_flows_config/migration.sql`
  - `apps/api/test/whatsapp-flows-onboarding.e2e-spec.ts`
  - `apps/api/src/scripts/deploy-whatsapp-flows.ts`

  **Files to Modify:**
  - `apps/api/prisma/schema.prisma` — add whatsappFlowsEnabled to Tenant
  - `apps/api/src/integrations/whatsapp/controllers/onboarding.controller.ts` — add Flow stats
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register all Flow providers
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Deployment Script
  ```typescript
  // apps/api/src/scripts/deploy-whatsapp-flows.ts

  /**
   * CLI script to deploy WhatsApp Flows to Meta
   *
   * Usage: npx ts-node apps/api/src/scripts/deploy-whatsapp-flows.ts
   *
   * Steps:
   * 1. Create flow via Graph API
   * 2. Upload flow JSON
   * 3. Run validation (Meta validates JSON schema)
   * 4. Publish flow
   * 5. Output flow ID for .env configuration
   */

  async function deployOnboardingFlow(): Promise<void> {
    const tenantName = process.env.DEFAULT_TENANT_NAME || 'Your Creche';

    console.log('Building onboarding flow definition...');
    const flowDef = buildOnboardingFlowDefinition(tenantName);

    console.log('Creating flow on Meta...');
    const { flowId } = await flowsService.createFlow(
      'CrecheBooks Parent Onboarding',
      ['SIGN_UP'],
      flowDef,
    );
    console.log(`Flow created: ${flowId}`);

    console.log('Validating flow...');
    // Meta validates automatically on upload

    console.log('Publishing flow...');
    await flowsService.publishFlow(flowId);
    console.log(`Flow published: ${flowId}`);

    console.log(`\nAdd to .env:`);
    console.log(`WHATSAPP_ONBOARDING_FLOW_ID=${flowId}`);
  }
  ```

  ### 2. Tenant Schema Update
  ```prisma
  model Tenant {
    // ... existing fields
    whatsappFlowsEnabled Boolean @default(false) @map("whatsapp_flows_enabled")
  }
  ```

  ### 3. Enhanced Stats Endpoint
  ```typescript
  // In onboarding.controller.ts — extend stats

  @Get('stats')
  async getStats(@TenantId() tenantId: string): Promise<OnboardingStatsDto> {
    const [total, inProgress, completed, abandoned] = await Promise.all([
      this.prisma.whatsAppOnboardingSession.count({ where: { tenantId } }),
      this.prisma.whatsAppOnboardingSession.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
      this.prisma.whatsAppOnboardingSession.count({ where: { tenantId, status: 'COMPLETED' } }),
      this.prisma.whatsAppOnboardingSession.count({ where: { tenantId, status: 'ABANDONED' } }),
    ]);

    // Track channel breakdown
    const flowCompleted = await this.prisma.whatsAppOnboardingSession.count({
      where: {
        tenantId,
        status: 'COMPLETED',
        collectedData: { path: ['_channel'], equals: 'flow' },
      },
    });

    const conversationalCompleted = completed - flowCompleted;

    return {
      total,
      inProgress,
      completed,
      abandoned,
      conversionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      channelBreakdown: {
        flow: flowCompleted,
        conversational: conversationalCompleted,
      },
    };
  }
  ```

  ### 4. E2E Tests
  ```typescript
  // apps/api/test/whatsapp-flows-onboarding.e2e-spec.ts

  describe('WhatsApp Flows Onboarding E2E', () => {
    it('should process completed flow and create records', async () => {
      // Simulate the data endpoint webhook from WhatsApp
      const flowData: FlowOnboardingData = {
        popia_consent: true,
        parent_first_name: 'Sarah',
        parent_surname: 'Smith',
        parent_email: 'sarah@example.com',
        parent_id_number: '8501015009087',
        child_first_name: 'Emma',
        child_dob: '2022-03-15',
        child_allergies: '',
        emergency_name: 'John Smith',
        emergency_phone: '+27821234568',
        emergency_relationship: 'parent',
        communication_pref: 'both',
      };

      const response = await request(app.getHttpServer())
        .post('/whatsapp/flows/data')
        .send({
          // Encrypted payload (use test keys)
          encrypted_flow_data: encrypt(flowData, testAesKey, testIv),
          encrypted_aes_key: encryptAesKey(testAesKey, testPublicKey),
          initial_vector: testIv.toString('base64'),
        })
        .expect(200);

      // Verify records
      const parent = await prisma.parent.findFirst({
        where: { email: 'sarah@example.com' },
        include: { children: true },
      });

      expect(parent).toBeDefined();
      expect(parent.firstName).toBe('Sarah');
      expect(parent.children).toHaveLength(1);
      expect(parent.popiaConsent).toBe(true);
    });

    it('should fall back to conversational when Flows disabled', async () => {
      // Ensure tenant has whatsappFlowsEnabled = false
      // Send "enroll" keyword
      // Verify conversational flow starts (not Flow message)
    });

    it('should handle decryption errors gracefully', async () => {
      // Send malformed encrypted data
      // Expect 400 error with clear message
    });

    it('should route to Flows when enabled for tenant', async () => {
      // Enable Flows for tenant
      // Send "enroll" keyword
      // Verify Flow message is sent (not conversational)
    });
  });
  ```

  ### 5. Migration Strategy
  ```
  Phase 1 → Phase 2 Migration Path:
  1. Deploy Flows to Meta (this task)
  2. Enable for ONE test tenant
  3. Monitor completion rates for 1 week
  4. Compare: Flow completion % vs Conversational completion %
  5. If Flow >= Conversational: enable for all tenants
  6. Keep conversational as fallback (never remove)

  Metrics to track:
  - Completion rate (started → completed)
  - Drop-off step (which screen/step has most abandonment)
  - Time to complete (first message → completion)
  - Error rate (crypto failures, API failures)
  ```

  ### 6. Error Recovery
  - If Meta Graph API is down: fall back to conversational
  - If flow data decryption fails: log error, return 400
  - If record creation fails: return error screen to user, store partial data
  - If admin notification fails: log but don't block completion
</critical_patterns>

<scope>
  <in_scope>
    - Flow deployment script (create, upload, validate, publish)
    - Tenant schema migration (whatsappFlowsEnabled)
    - Enhanced stats with channel breakdown (Flow vs conversational)
    - E2E tests for Flow completion webhook
    - E2E tests for fallback routing
    - E2E tests for error handling
    - Migration strategy documentation
    - Error recovery for API failures
  </in_scope>
  <out_of_scope>
    - Flow analytics dashboard UI (future web task)
    - A/B testing framework (simple flag suffices)
    - Automated rollout (manual tenant-by-tenant)
    - Flow versioning (future iteration)
    - WhatsApp Flows payment integration (TASK-WA-020)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create deployment script
# Create apps/api/src/scripts/deploy-whatsapp-flows.ts

# 2. Add tenant migration
# Run: pnpm --filter @crechebooks/api prisma migrate dev --name add_whatsapp_flows_config

# 3. Create E2E tests
# Create apps/api/test/whatsapp-flows-onboarding.e2e-spec.ts

# 4. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
pnpm test:e2e -- --grep "WhatsApp Flows"
```
</verification_commands>

<definition_of_done>
  - [ ] Deployment script creates and publishes Flow on Meta
  - [ ] Tenant model has whatsappFlowsEnabled field
  - [ ] Migration created and applied
  - [ ] Stats endpoint includes channel breakdown
  - [ ] E2E test: Flow completion creates records
  - [ ] E2E test: Fallback to conversational when Flows disabled
  - [ ] E2E test: Decryption error handling
  - [ ] E2E test: Routing based on tenant config
  - [ ] Error recovery for API/crypto/DB failures
  - [ ] Migration strategy documented in task spec
  - [ ] All providers registered in module
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
