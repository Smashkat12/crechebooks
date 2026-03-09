<task_spec id="TASK-WA-016" version="2.0">

<metadata>
  <title>WhatsApp Flows Onboarding Form Definition</title>
  <status>pending</status>
  <phase>29</phase>
  <layer>logic</layer>
  <sequence>718</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-FLOWS-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="pending">TASK-WA-015</task_ref>
    <task_ref status="pending">TASK-WA-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - No WhatsApp Flow JSON definition for parent onboarding
  - Phase 1 conversational flow requires 16+ messages — Flows can do it in 5 screens
  - Need structured form with proper input types (date pickers, dropdowns, validation)
  - Need data endpoint to receive completed flow data

  **Existing Resources:**
  - WhatsAppFlowsService (TASK-WA-015) — API integration
  - WhatsApp Flow types (TASK-WA-015) — JSON schema types
  - OnboardingCollectedData interface (TASK-WA-011) — data shape
  - Phase 1 step definitions (TASK-WA-012) — validation rules to replicate

  **Gap:**
  - No flow JSON definition for onboarding
  - No data endpoint controller for flow responses
  - No flow registration script
  - No mapping from flow response to OnboardingCollectedData

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/flows/onboarding-flow.definition.ts`
  - `apps/api/src/integrations/whatsapp/controllers/flows-data-endpoint.controller.ts`
  - `apps/api/src/scripts/register-whatsapp-flows.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register controller
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Onboarding Flow Definition (5 Screens)
  ```typescript
  // apps/api/src/integrations/whatsapp/flows/onboarding-flow.definition.ts

  import { WhatsAppFlowDefinition } from '../types/whatsapp-flows.types';

  export function buildOnboardingFlowDefinition(
    tenantName: string,
  ): WhatsAppFlowDefinition {
    return {
      version: '5.0',
      data_api_version: '3.0',
      routing_model: {
        CONSENT: ['PARENT_DETAILS'],
        PARENT_DETAILS: ['CHILD_DETAILS'],
        CHILD_DETAILS: ['EMERGENCY_CONTACT'],
        EMERGENCY_CONTACT: ['CONFIRMATION'],
        CONFIRMATION: [],
      },
      screens: [
        consentScreen(tenantName),
        parentDetailsScreen(),
        childDetailsScreen(),
        emergencyContactScreen(),
        confirmationScreen(tenantName),
      ],
    };
  }
  ```

  ### 2. Screen 1: POPIA Consent
  ```typescript
  function consentScreen(tenantName: string): WhatsAppFlowScreen {
    return {
      id: 'CONSENT',
      title: 'Welcome',
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'TextHeading',
            text: `Register at ${tenantName}`,
          },
          {
            type: 'TextBody',
            text: `Welcome! This form will collect your details to register your child at ${tenantName}.\n\nIn accordance with POPIA, your personal information will only be used for enrollment and communication purposes. You can request deletion at any time.`,
          },
          {
            type: 'OptIn',
            name: 'popia_consent',
            label: 'I consent to the collection and processing of my personal information as described above.',
            required: true,
            'on-select-action': { name: 'update_data' },
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'navigate',
              next: { type: 'screen', name: 'PARENT_DETAILS' },
              payload: { popia_consent: '${form.popia_consent}' },
            },
          },
        ],
      },
    };
  }
  ```

  ### 3. Screen 2: Parent Details
  ```typescript
  function parentDetailsScreen(): WhatsAppFlowScreen {
    return {
      id: 'PARENT_DETAILS',
      title: 'Your Details',
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'TextSubheading',
            text: 'Step 1 of 4: Parent Information',
          },
          {
            type: 'TextInput',
            name: 'parent_first_name',
            label: 'First Name',
            required: true,
            'input-type': 'text',
          },
          {
            type: 'TextInput',
            name: 'parent_surname',
            label: 'Surname',
            required: true,
            'input-type': 'text',
          },
          {
            type: 'TextInput',
            name: 'parent_email',
            label: 'Email Address',
            required: true,
            'input-type': 'email',
          },
          {
            type: 'TextInput',
            name: 'parent_id_number',
            label: 'SA ID Number (optional)',
            required: false,
            'input-type': 'number',
            'helper-text': '13-digit South African ID number',
          },
          {
            type: 'Footer',
            label: 'Next',
            'on-click-action': {
              name: 'navigate',
              next: { type: 'screen', name: 'CHILD_DETAILS' },
              payload: {
                parent_first_name: '${form.parent_first_name}',
                parent_surname: '${form.parent_surname}',
                parent_email: '${form.parent_email}',
                parent_id_number: '${form.parent_id_number}',
              },
            },
          },
        ],
      },
    };
  }
  ```

  ### 4. Screen 3: Child Details
  ```typescript
  function childDetailsScreen(): WhatsAppFlowScreen {
    return {
      id: 'CHILD_DETAILS',
      title: 'Child Details',
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'TextSubheading',
            text: 'Step 2 of 4: Child Information',
          },
          {
            type: 'TextInput',
            name: 'child_first_name',
            label: "Child's First Name",
            required: true,
            'input-type': 'text',
          },
          {
            type: 'DatePicker',
            name: 'child_dob',
            label: 'Date of Birth',
            required: true,
            'min-date': '', // Dynamically set to 7 years ago
            'max-date': '', // Today
          },
          {
            type: 'TextArea',
            name: 'child_allergies',
            label: 'Allergies or Medical Conditions',
            required: false,
            'helper-text': 'Leave blank if none',
          },
          {
            type: 'Footer',
            label: 'Next',
            'on-click-action': {
              name: 'navigate',
              next: { type: 'screen', name: 'EMERGENCY_CONTACT' },
              payload: {
                child_first_name: '${form.child_first_name}',
                child_dob: '${form.child_dob}',
                child_allergies: '${form.child_allergies}',
              },
            },
          },
        ],
      },
    };
  }
  ```

  ### 5. Screen 4: Emergency Contact
  ```typescript
  function emergencyContactScreen(): WhatsAppFlowScreen {
    return {
      id: 'EMERGENCY_CONTACT',
      title: 'Emergency Contact',
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'TextSubheading',
            text: 'Step 3 of 4: Emergency Contact',
          },
          {
            type: 'TextInput',
            name: 'emergency_name',
            label: 'Full Name',
            required: true,
            'input-type': 'text',
          },
          {
            type: 'TextInput',
            name: 'emergency_phone',
            label: 'Phone Number',
            required: true,
            'input-type': 'phone',
          },
          {
            type: 'Dropdown',
            name: 'emergency_relationship',
            label: 'Relationship to Child',
            required: true,
            'data-source': [
              { id: 'parent', title: 'Parent' },
              { id: 'grandparent', title: 'Grandparent' },
              { id: 'sibling', title: 'Sibling' },
              { id: 'aunt_uncle', title: 'Aunt/Uncle' },
              { id: 'other', title: 'Other' },
            ],
          },
          {
            type: 'Footer',
            label: 'Next',
            'on-click-action': {
              name: 'navigate',
              next: { type: 'screen', name: 'CONFIRMATION' },
              payload: {
                emergency_name: '${form.emergency_name}',
                emergency_phone: '${form.emergency_phone}',
                emergency_relationship: '${form.emergency_relationship}',
              },
            },
          },
        ],
      },
    };
  }
  ```

  ### 6. Screen 5: Confirmation
  ```typescript
  function confirmationScreen(tenantName: string): WhatsAppFlowScreen {
    return {
      id: 'CONFIRMATION',
      title: 'Confirm Registration',
      terminal: true,
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'TextSubheading',
            text: 'Step 4 of 4: Review & Submit',
          },
          {
            type: 'TextBody',
            text: `Please review your details. By submitting, you confirm all information is accurate and consent to ${tenantName} processing your data for enrollment purposes.`,
          },
          {
            type: 'RadioButtonsGroup',
            name: 'communication_pref',
            label: 'How should we contact you?',
            required: true,
            'data-source': [
              { id: 'whatsapp', title: 'WhatsApp' },
              { id: 'email', title: 'Email' },
              { id: 'both', title: 'Both' },
            ],
          },
          {
            type: 'Footer',
            label: 'Submit Registration',
            'on-click-action': {
              name: 'complete',
              payload: {
                communication_pref: '${form.communication_pref}',
              },
            },
          },
        ],
      },
    };
  }
  ```

  ### 7. Data Endpoint
  When the user completes the flow, WhatsApp sends all collected data to the data endpoint:
  ```typescript
  // apps/api/src/integrations/whatsapp/controllers/flows-data-endpoint.controller.ts

  @Controller('whatsapp/flows')
  export class FlowsDataEndpointController {
    /**
     * POST /whatsapp/flows/data
     * WhatsApp Flows data endpoint — receives completed flow data
     */
    @Post('data')
    async handleFlowData(
      @Body() body: FlowDataEndpointRequest,
    ): Promise<FlowDataEndpointResponse> {
      // Decrypt the request (WhatsApp Flows uses encryption)
      // Extract collected data
      // Map to OnboardingCollectedData
      // Create Parent/Child/EmergencyContact (same as Phase 1)
      // Return success screen
    }
  }
  ```

  ### 8. Registration Script
  Similar to register-whatsapp-templates.ts, create a CLI script to:
  1. Create the flow via Graph API
  2. Upload the flow JSON
  3. Publish the flow
  4. Store the flow ID in config/env
</critical_patterns>

<scope>
  <in_scope>
    - 5-screen onboarding flow JSON definition
    - Dynamic tenant name injection
    - POPIA consent screen with OptIn component
    - Parent details with email/phone/ID inputs
    - Child details with DatePicker
    - Emergency contact with Dropdown
    - Confirmation with communication preference
    - Data endpoint controller for flow completion
    - Flow registration CLI script
    - Flow JSON builder function
  </in_scope>
  <out_of_scope>
    - Multi-child support in Flows (limited by Flow screen complexity)
    - ID document upload in Flows (not supported by Flows components)
    - Admin dashboard for Flows (reuse TASK-WA-014 endpoints)
    - Conversational fallback detection (TASK-WA-017)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create flow definition
# Create apps/api/src/integrations/whatsapp/flows/onboarding-flow.definition.ts

# 2. Create data endpoint controller
# Create apps/api/src/integrations/whatsapp/controllers/flows-data-endpoint.controller.ts

# 3. Create registration script
# Create apps/api/src/scripts/register-whatsapp-flows.ts

# 4. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] buildOnboardingFlowDefinition() function created
  - [ ] Screen 1: POPIA consent with OptIn component
  - [ ] Screen 2: Parent details (name, surname, email, ID)
  - [ ] Screen 3: Child details (name, DOB with DatePicker, allergies)
  - [ ] Screen 4: Emergency contact (name, phone, relationship Dropdown)
  - [ ] Screen 5: Confirmation with communication preferences
  - [ ] Tenant name dynamically injected into flow
  - [ ] FlowsDataEndpointController handles completion webhook
  - [ ] Flow data mapped to OnboardingCollectedData
  - [ ] Registration script creates, uploads, and publishes flow
  - [ ] Flow JSON validates against WhatsApp Flows v5.0 schema
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
