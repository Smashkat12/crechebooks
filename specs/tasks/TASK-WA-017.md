<task_spec id="TASK-WA-017" version="2.0">

<metadata>
  <title>WhatsApp Flows Onboarding Processing and Fallback</title>
  <status>pending</status>
  <phase>29</phase>
  <layer>logic</layer>
  <sequence>719</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-FLOWS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="pending">TASK-WA-016</task_ref>
    <task_ref status="pending">TASK-WA-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Flow completion data must be processed into Parent/Child/EmergencyContact records
  - Need encryption/decryption for WhatsApp Flows data exchange
  - Not all WhatsApp versions support Flows — need fallback to conversational (Phase 1)
  - No unified onboarding entry point that routes between Flows and conversational
  - Flow responses have different field names than conversational collected data

  **Existing Resources:**
  - WhatsAppFlowsService (TASK-WA-015) — API integration
  - Onboarding flow definition (TASK-WA-016) — form screens
  - FlowsDataEndpointController (TASK-WA-016) — webhook stub
  - OnboardingConversationHandler (TASK-WA-012) — conversational fallback
  - OnboardingCollectedData interface (TASK-WA-011) — unified data shape

  **Gap:**
  - No flow data decryption (AES-GCM with RSA key exchange)
  - No flow response → OnboardingCollectedData mapper
  - No record creation from flow response
  - No unified entry point to detect Flows support
  - No A/B testing or gradual rollout mechanism

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/services/flows-onboarding.processor.ts`
  - `apps/api/src/integrations/whatsapp/utils/flows-crypto.util.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/controllers/flows-data-endpoint.controller.ts` — wire up processor
  - `apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts` — add Flows routing
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register processor
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Flow Data Decryption
  WhatsApp Flows uses AES-128-GCM encryption for data exchange:
  ```typescript
  // apps/api/src/integrations/whatsapp/utils/flows-crypto.util.ts

  import * as crypto from 'crypto';

  export function decryptFlowRequest(
    encryptedBody: string,
    encryptedAesKey: string,
    initialVector: string,
    privateKey: string,
  ): { decryptedBody: Record<string, unknown>; aesKeyBuffer: Buffer; ivBuffer: Buffer } {
    // 1. Decrypt the AES key with RSA private key
    const aesKeyBuffer = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encryptedAesKey, 'base64'),
    );

    // 2. Decrypt the body with AES-128-GCM
    const ivBuffer = Buffer.from(initialVector, 'base64');
    const encryptedBuffer = Buffer.from(encryptedBody, 'base64');

    const TAG_LENGTH = 16;
    const encrypted = encryptedBuffer.subarray(0, -TAG_LENGTH);
    const tag = encryptedBuffer.subarray(-TAG_LENGTH);

    const decipher = crypto.createDecipheriv('aes-128-gcm', aesKeyBuffer, ivBuffer);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return {
      decryptedBody: JSON.parse(decrypted),
      aesKeyBuffer,
      ivBuffer,
    };
  }

  export function encryptFlowResponse(
    responseData: Record<string, unknown>,
    aesKeyBuffer: Buffer,
    ivBuffer: Buffer,
  ): string {
    // Flip the IV for response
    const flippedIv = Buffer.alloc(ivBuffer.length);
    for (let i = 0; i < ivBuffer.length; i++) {
      flippedIv[i] = ~ivBuffer[i] & 0xff;
    }

    const cipher = crypto.createCipheriv('aes-128-gcm', aesKeyBuffer, flippedIv);
    let encrypted = cipher.update(JSON.stringify(responseData), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final(), cipher.getAuthTag()]);

    return encrypted.toString('base64');
  }
  ```

  ### 2. Flow Response Processor
  ```typescript
  // apps/api/src/integrations/whatsapp/services/flows-onboarding.processor.ts

  @Injectable()
  export class FlowsOnboardingProcessor {
    private readonly logger = new Logger(FlowsOnboardingProcessor.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly notificationService: NotificationService,
    ) {}

    /**
     * Process completed onboarding flow data
     */
    async processFlowCompletion(
      waId: string,
      tenantId: string,
      flowData: FlowOnboardingData,
    ): Promise<{ parentId: string }> {
      // Map flow fields to OnboardingCollectedData
      const collectedData = this.mapFlowData(flowData);

      // Create records (same as Phase 1 completion)
      const parent = await this.prisma.parent.create({
        data: {
          tenantId,
          firstName: collectedData.parent.firstName,
          lastName: collectedData.parent.surname,
          email: collectedData.parent.email,
          phone: waId,
          idNumber: collectedData.parent.idNumber || null,
          whatsappOptIn: collectedData.communicationPrefs?.whatsapp ?? true,
          popiaConsent: collectedData.popiaConsent,
          popiaConsentAt: new Date(),
        },
      });

      // Create child
      for (const child of collectedData.children || []) {
        await this.prisma.child.create({
          data: {
            tenantId,
            parentId: parent.id,
            firstName: child.firstName,
            dateOfBirth: new Date(child.dateOfBirth),
            allergies: child.allergies || null,
          },
        });
      }

      // Create emergency contact
      if (collectedData.emergencyContact) {
        await this.prisma.emergencyContact.create({
          data: {
            tenantId,
            parentId: parent.id,
            name: collectedData.emergencyContact.name,
            phone: collectedData.emergencyContact.phone,
            relationship: collectedData.emergencyContact.relationship,
          },
        });
      }

      // Update onboarding session (if exists)
      await this.prisma.whatsAppOnboardingSession.upsert({
        where: { tenantId_waId: { tenantId, waId } },
        create: {
          tenantId,
          waId,
          parentId: parent.id,
          currentStep: 'COMPLETE',
          status: 'COMPLETED',
          collectedData: collectedData as any,
          completedAt: new Date(),
        },
        update: {
          parentId: parent.id,
          currentStep: 'COMPLETE',
          status: 'COMPLETED',
          collectedData: collectedData as any,
          completedAt: new Date(),
        },
      });

      // Notify admins
      await this.notifyAdmins(tenantId, collectedData, waId);

      return { parentId: parent.id };
    }

    /**
     * Map flow field names to OnboardingCollectedData
     */
    private mapFlowData(flowData: FlowOnboardingData): OnboardingCollectedData {
      return {
        parent: {
          firstName: flowData.parent_first_name,
          surname: flowData.parent_surname,
          email: flowData.parent_email,
          idNumber: flowData.parent_id_number || undefined,
        },
        children: [{
          firstName: flowData.child_first_name,
          dateOfBirth: flowData.child_dob,
          allergies: flowData.child_allergies || undefined,
        }],
        emergencyContact: {
          name: flowData.emergency_name,
          phone: flowData.emergency_phone,
          relationship: flowData.emergency_relationship,
        },
        popiaConsent: flowData.popia_consent === true,
        communicationPrefs: {
          whatsapp: ['whatsapp', 'both'].includes(flowData.communication_pref),
          email: ['email', 'both'].includes(flowData.communication_pref),
        },
      };
    }

    private async notifyAdmins(
      tenantId: string,
      data: OnboardingCollectedData,
      waId: string,
    ): Promise<void> {
      // Same admin notification as Phase 1
    }
  }

  /**
   * Raw flow response data shape (matches form field names)
   */
  export interface FlowOnboardingData {
    popia_consent: boolean;
    parent_first_name: string;
    parent_surname: string;
    parent_email: string;
    parent_id_number?: string;
    child_first_name: string;
    child_dob: string;
    child_allergies?: string;
    emergency_name: string;
    emergency_phone: string;
    emergency_relationship: string;
    communication_pref: 'whatsapp' | 'email' | 'both';
  }
  ```

  ### 3. Unified Onboarding Entry Point
  ```typescript
  // In onboarding-conversation.handler.ts

  /**
   * Route to Flows or conversational based on capability
   */
  async initiateOnboarding(
    waId: string,
    tenantId: string,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const flowId = this.configService.get('WHATSAPP_ONBOARDING_FLOW_ID');

    if (flowId && tenant.whatsappFlowsEnabled) {
      // Preferred: send Flow message
      await this.flowsService.sendFlowMessage(
        waId,
        flowId,
        `Register at ${tenant.tradingName}`,
        `Complete this quick form to register your child at ${tenant.tradingName}. It only takes a few minutes.`,
        'Start Registration',
      );
    } else {
      // Fallback: conversational onboarding
      await this.startConversationalOnboarding(waId, tenantId, tenant);
    }
  }
  ```

  ### 4. Tenant Configuration
  Add `whatsappFlowsEnabled` flag to Tenant model for gradual rollout:
  - Default: false (use conversational)
  - Admin can enable per-tenant when Flows are tested and ready
  - Allows A/B comparison of completion rates
</critical_patterns>

<scope>
  <in_scope>
    - Flow data encryption/decryption utilities (AES-GCM + RSA)
    - FlowsOnboardingProcessor service
    - Flow response → OnboardingCollectedData mapping
    - Record creation from flow data (Parent, Child, EmergencyContact)
    - Unified onboarding entry point (Flows vs conversational routing)
    - Tenant whatsappFlowsEnabled flag
    - Admin notification on Flow-based completion
    - Unit tests for crypto utilities
    - Unit tests for data mapping
  </in_scope>
  <out_of_scope>
    - Multi-child in Flows (Flows limitation — use "Add Another" as separate flow trigger)
    - ID document in Flows (not supported — follow up conversationally)
    - Flow analytics dashboard (future task)
    - A/B testing framework (use simple flag for now)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create processor and crypto utility
# Create apps/api/src/integrations/whatsapp/services/flows-onboarding.processor.ts
# Create apps/api/src/integrations/whatsapp/utils/flows-crypto.util.ts

# 2. Update data endpoint controller
# Edit apps/api/src/integrations/whatsapp/controllers/flows-data-endpoint.controller.ts

# 3. Update conversation handler for routing
# Edit apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts

# 4. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] Flow data decryption utility (AES-128-GCM + RSA OAEP)
  - [ ] Flow response encryption utility (flipped IV)
  - [ ] FlowsOnboardingProcessor with processFlowCompletion()
  - [ ] Flow field → OnboardingCollectedData mapper
  - [ ] Parent/Child/EmergencyContact creation from flow data
  - [ ] WhatsAppOnboardingSession upsert on completion
  - [ ] Unified entry point: Flows vs conversational routing
  - [ ] Tenant whatsappFlowsEnabled flag
  - [ ] Admin notification on completion (shared with Phase 1)
  - [ ] Unit tests for crypto (encrypt/decrypt round-trip)
  - [ ] Unit tests for data mapping
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
