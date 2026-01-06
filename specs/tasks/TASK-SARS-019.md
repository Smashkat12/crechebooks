<task_spec id="TASK-SARS-019" version="1.0">

<metadata>
  <title>SARS eFiling API Real Integration</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>logic</layer>
  <sequence>148</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-SARS-005</requirement_ref>
    <requirement_ref>EC-SARS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-018</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis, it was discovered that the SARS eFiling API integration
is entirely mocked. The `callSarsApi()` method in the submission retry service returns
fake references instead of calling the real SARS API.

## Current State
- File: `apps/api/src/database/services/sars-submission-retry.service.ts` (lines 500-527)
- Method `callSarsApi()` contains: `// TODO: Replace with actual SARS API integration`
- Currently returns mock reference: `SARS${Date.now()}${Math.random()...}`
- Simulates API call with `setTimeout(resolve, 100)`
- No real SARS authentication or API calls

## What Should Happen (Per PRD REQ-SARS-005)
SARS eFiling integration should:
1. Authenticate with SARS eFiling portal using credentials
2. Format VAT201 submission per SARS specification
3. Submit via SARS eFiling API (REST/SOAP)
4. Receive and store SARS reference number
5. Handle SARS error responses and status updates
6. Support sandbox/production environments

## Project Context
- **Submission Service**: `apps/api/src/database/services/sars-submission-retry.service.ts`
- **VAT201 Service**: `apps/api/src/database/services/vat201.service.ts`
- **Submission Types**: `apps/api/src/database/types/sars-submission.types.ts`
- **South Africa**: SARS eFiling uses specific XML format for VAT201
- **Environment**: Production and Sandbox environments needed

## SARS eFiling API Details
- **Portal**: https://www.sarsefiling.co.za/ (production)
- **Sandbox**: https://www.sarsefiling.co.za/TestEnvironment/ (testing)
- **Authentication**: OAuth2 or certificate-based
- **Format**: XML-based submission format
- **VAT201**: Specific schema for VAT vendor returns
</context>

<input_context_files>
  <file purpose="submission_retry_service">apps/api/src/database/services/sars-submission-retry.service.ts</file>
  <file purpose="vat201_service">apps/api/src/database/services/vat201.service.ts</file>
  <file purpose="sars_controller">apps/api/src/api/sars/sars.controller.ts</file>
  <file purpose="submission_types">apps/api/src/database/types/sars-submission.types.ts</file>
  <file purpose="prisma_schema">apps/api/prisma/schema.prisma#SarsSubmission</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-018 completed (retry service infrastructure exists)</check>
  <check>VAT201 generation works correctly</check>
  <check>SARS eFiling test credentials obtained</check>
  <check>SARS API documentation reviewed</check>
</prerequisites>

<scope>
  <in_scope>
    - Create SarsEfilingClient service for API communication
    - Implement OAuth2 or certificate authentication with SARS
    - Format VAT201 data per SARS XML specification
    - Replace mock callSarsApi() with real implementation
    - Handle SARS error responses and codes
    - Store SARS reference numbers
    - Environment configuration (sandbox vs production)
    - Logging and audit trail for submissions
    - Unit tests with mocked SARS responses
    - Integration tests with sandbox environment
  </in_scope>
  <out_of_scope>
    - EMP201 (employee tax) submissions
    - IT14 (company tax) submissions
    - SARS correspondence handling
    - Automatic filing reminders
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/integrations/sars/sars-efiling.client.ts">
      import { Injectable, Logger } from '@nestjs/common';
      import { ConfigService } from '@nestjs/config';
      import { HttpService } from '@nestjs/axios';

      export interface SarsSubmissionPayload {
        submissionType: 'VAT201';
        vatNumber: string;
        periodStart: Date;
        periodEnd: Date;
        fields: Vat201Fields;
        tenantVatNumber: string;
      }

      export interface SarsSubmissionResponse {
        success: boolean;
        reference?: string;
        errorCode?: string;
        errorMessage?: string;
        status: 'ACCEPTED' | 'REJECTED' | 'PENDING';
      }

      @Injectable()
      export class SarsEfilingClient {
        private readonly logger = new Logger(SarsEfilingClient.name);

        constructor(
          private readonly configService: ConfigService,
          private readonly httpService: HttpService,
        ) {}

        /**
         * Authenticate with SARS eFiling portal
         * @returns Access token for API calls
         */
        async authenticate(): Promise&lt;string&gt;;

        /**
         * Submit VAT201 to SARS eFiling
         * @param payload - VAT201 submission data
         * @returns SARS response with reference number
         */
        async submitVat201(
          payload: SarsSubmissionPayload,
        ): Promise&lt;SarsSubmissionResponse&gt;;

        /**
         * Check submission status with SARS
         * @param reference - SARS reference number
         */
        async checkStatus(reference: string): Promise&lt;SarsSubmissionResponse&gt;;

        /**
         * Format VAT201 data to SARS XML schema
         */
        private formatVat201Xml(payload: SarsSubmissionPayload): string;
      }
    </signature>
  </signatures>

  <constraints>
    - SARS credentials MUST be in environment variables (never hardcoded)
    - Use sandbox environment for development and testing
    - Production flag must require explicit configuration
    - All API calls must be logged with correlation IDs
    - Sensitive data (credentials, VAT numbers) must be redacted in logs
    - XML format must comply with SARS VAT201 schema
    - Handle SARS rate limiting and retry appropriately
    - Store raw SARS responses for debugging
  </constraints>

  <verification>
    - Authentication with SARS sandbox works
    - VAT201 submission accepted by SARS sandbox
    - Reference number stored correctly
    - Error responses handled gracefully
    - Status checking works
    - Unit tests pass with mocked responses
    - Integration tests pass with sandbox
  </verification>
</definition_of_done>

<pseudo_code>
SarsEfilingClient (apps/api/src/integrations/sars/sars-efiling.client.ts):

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { XMLBuilder } from 'fast-xml-parser';
import { Vat201Fields } from '../../database/dto/vat201.dto';

@Injectable()
export class SarsEfilingClient {
  private readonly logger = new Logger(SarsEfilingClient.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const isSandbox = this.configService.get<boolean>('SARS_SANDBOX', true);
    this.baseUrl = isSandbox
      ? 'https://api.sarsefiling.co.za/sandbox'
      : 'https://api.sarsefiling.co.za/v1';
    this.clientId = this.configService.get<string>('SARS_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('SARS_CLIENT_SECRET', '');

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('SARS eFiling credentials not configured');
    }
  }

  async authenticate(): Promise<string> {
    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    this.logger.log('Authenticating with SARS eFiling');

    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + (response.data.expires_in * 1000));

    this.logger.log('SARS authentication successful');
    return this.accessToken;
  }

  async submitVat201(
    payload: SarsSubmissionPayload,
    correlationId: string,
  ): Promise<SarsSubmissionResponse> {
    this.logger.log(`Submitting VAT201 to SARS`, { correlationId });

    try {
      const token = await this.authenticate();
      const xmlPayload = this.formatVat201Xml(payload);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/vat/submit`,
          xmlPayload,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/xml',
              'X-Correlation-ID': correlationId,
            },
          },
        ),
      );

      this.logger.log(`SARS submission successful: ${response.data.reference}`, { correlationId });

      return {
        success: true,
        reference: response.data.reference,
        status: 'ACCEPTED',
      };

    } catch (error) {
      this.logger.error(`SARS submission failed: ${error.message}`, { correlationId });

      // Parse SARS error response
      const errorCode = error.response?.data?.errorCode || 'UNKNOWN';
      const errorMessage = error.response?.data?.message || error.message;

      return {
        success: false,
        errorCode,
        errorMessage,
        status: 'REJECTED',
      };
    }
  }

  async checkStatus(reference: string): Promise<SarsSubmissionResponse> {
    const token = await this.authenticate();

    const response = await firstValueFrom(
      this.httpService.get(
        `${this.baseUrl}/vat/status/${reference}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        },
      ),
    );

    return {
      success: response.data.status !== 'REJECTED',
      reference,
      status: response.data.status,
    };
  }

  private formatVat201Xml(payload: SarsSubmissionPayload): string {
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
    });

    const vat201 = {
      VAT201: {
        '@_version': '1.0',
        TaxpayerDetails: {
          VATNumber: payload.vatNumber,
        },
        Period: {
          StartDate: payload.periodStart.toISOString().split('T')[0],
          EndDate: payload.periodEnd.toISOString().split('T')[0],
        },
        Fields: {
          Field1_StandardRated: payload.fields.field1OutputStandardCents / 100,
          Field4_TotalOutput: payload.fields.field4TotalOutputCents / 100,
          Field5_InputTax: payload.fields.field5InputTaxCents / 100,
          Field15_NetVAT: payload.fields.field15NetVatCents / 100,
          Field19_TotalDue: payload.fields.field19TotalDueCents / 100,
        },
      },
    };

    return builder.build(vat201);
  }
}

// Update sars-submission-retry.service.ts:

private async callSarsApi(
  submission: any,
  correlationId: string,
): Promise<{ reference: string }> {
  // Format submission data for SARS
  const payload: SarsSubmissionPayload = {
    submissionType: 'VAT201',
    vatNumber: submission.documentData.vatNumber,
    periodStart: new Date(submission.periodStart),
    periodEnd: new Date(submission.periodEnd),
    fields: submission.documentData.fields,
    tenantVatNumber: submission.documentData.vatNumber,
  };

  // Call real SARS API
  const response = await this.sarsEfilingClient.submitVat201(
    payload,
    correlationId,
  );

  if (!response.success) {
    throw new SarsSubmissionError(
      response.errorMessage || 'SARS submission failed',
      response.errorCode || 'SARS_ERROR',
    );
  }

  return { reference: response.reference! };
}

// Environment variables (.env.example):
SARS_SANDBOX=true
SARS_CLIENT_ID=your_client_id
SARS_CLIENT_SECRET=your_client_secret
</pseudo_code>

<files_to_create>
  <file path="apps/api/src/integrations/sars/sars-efiling.client.ts">SARS eFiling API client</file>
  <file path="apps/api/src/integrations/sars/sars-efiling.client.spec.ts">Unit tests with mocked responses</file>
  <file path="apps/api/src/integrations/sars/sars.module.ts">SARS integration module</file>
  <file path="apps/api/src/integrations/sars/dto/sars-efiling.dto.ts">SARS API DTOs</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/sars-submission-retry.service.ts">Replace callSarsApi() mock with real implementation</file>
  <file path="apps/api/src/database/database.module.ts">Import SARS module</file>
  <file path="apps/api/.env.example">Add SARS environment variables</file>
  <file path="apps/api/package.json">Add fast-xml-parser for XML generation</file>
</files_to_modify>

<validation_criteria>
  <criterion>SarsEfilingClient authenticates with sandbox</criterion>
  <criterion>VAT201 XML format matches SARS specification</criterion>
  <criterion>Submission returns valid reference number</criterion>
  <criterion>Error responses parsed correctly</criterion>
  <criterion>Credentials stored in environment variables</criterion>
  <criterion>Production requires explicit flag</criterion>
  <criterion>All API calls logged with correlation IDs</criterion>
  <criterion>Unit tests pass with mocked responses</criterion>
  <criterion>Integration tests pass with sandbox (optional)</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/api && npm install fast-xml-parser</command>
  <command>npm run build</command>
  <command>npm run test -- sars-efiling.client</command>
  <command>npm run test -- sars-submission-retry.service</command>
</test_commands>

</task_spec>
