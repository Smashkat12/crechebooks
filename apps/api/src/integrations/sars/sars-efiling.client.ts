/**
 * SARS eFiling Client
 * TASK-SARS-019: SARS eFiling API Real Integration
 *
 * Production-ready SARS eFiling API client for VAT201 submissions.
 * Implements fail-fast behavior if credentials aren't configured.
 *
 * SARS eFiling Requirements (South Africa):
 * 1. Register at https://www.sarsefiling.co.za/
 * 2. Obtain API credentials (client_id/client_secret)
 * 3. Configure environment variables
 * 4. For sandbox testing, use SARS_SANDBOX=true
 *
 * @see https://www.sars.gov.za/businesses/efiling/
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../shared/exceptions';

/**
 * VAT201 field data for SARS submission
 */
export interface Vat201FieldData {
  /** Field 1: Standard-rated supplies (output tax) */
  field1OutputStandardCents: number;
  /** Field 2: Zero-rated supplies */
  field2ZeroRatedCents?: number;
  /** Field 3: Exempt supplies */
  field3ExemptCents?: number;
  /** Field 4: Total output tax */
  field4TotalOutputCents: number;
  /** Field 5: Total input tax */
  field5InputTaxCents: number;
  /** Field 6: Capital goods input tax */
  field6CapitalGoodsCents?: number;
  /** Field 15: Net VAT (output - input) */
  field15NetVatCents: number;
  /** Field 19: Total due/refundable */
  field19TotalDueCents: number;
}

/**
 * Payload for SARS VAT201 submission
 */
export interface SarsSubmissionPayload {
  /** Submission type (currently only VAT201) */
  submissionType: 'VAT201';
  /** Tenant's VAT registration number */
  vatNumber: string;
  /** Tax period start date */
  periodStart: Date;
  /** Tax period end date */
  periodEnd: Date;
  /** VAT201 field values */
  fields: Vat201FieldData;
}

/**
 * Response from SARS eFiling API
 */
export interface SarsSubmissionResponse {
  /** Whether submission was accepted */
  success: boolean;
  /** SARS reference number (if successful) */
  reference?: string;
  /** Error code from SARS */
  errorCode?: string;
  /** Human-readable error message */
  errorMessage?: string;
  /** Submission status */
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING' | 'QUEUED';
  /** Raw response data for debugging */
  rawResponse?: string;
}

/**
 * SARS eFiling API configuration
 */
export interface SarsEfilingConfig {
  /** SARS API base URL */
  baseUrl: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** Whether using sandbox environment */
  isSandbox: boolean;
}

/**
 * SARS eFiling Client
 *
 * Handles authentication and submission to SARS eFiling portal.
 * Implements fail-fast behavior when credentials aren't configured.
 */
@Injectable()
export class SarsEfilingClient implements OnModuleInit {
  private readonly logger = new Logger(SarsEfilingClient.name);
  private readonly config: SarsEfilingConfig;
  private readonly isConfigured: boolean;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  /** SARS eFiling API endpoints */
  private static readonly ENDPOINTS = {
    SANDBOX: 'https://api.sarsefiling.co.za/sandbox/v1',
    PRODUCTION: 'https://api.sarsefiling.co.za/v1',
  };

  constructor(private readonly configService: ConfigService) {
    const isSandbox = this.configService.get<boolean>('SARS_SANDBOX', true);
    const clientId = this.configService.get<string>('SARS_CLIENT_ID', '');
    const clientSecret = this.configService.get<string>('SARS_CLIENT_SECRET', '');

    this.config = {
      baseUrl: isSandbox
        ? SarsEfilingClient.ENDPOINTS.SANDBOX
        : SarsEfilingClient.ENDPOINTS.PRODUCTION,
      clientId,
      clientSecret,
      isSandbox,
    };

    // Check if properly configured
    this.isConfigured = !!(clientId && clientSecret);
  }

  /**
   * Module initialization - log configuration status
   */
  onModuleInit(): void {
    if (!this.isConfigured) {
      this.logger.error({
        error: {
          message: 'SARS eFiling credentials not configured',
          name: 'ConfigurationError',
        },
        file: 'sars-efiling.client.ts',
        function: 'onModuleInit',
        inputs: {
          hasClientId: !!this.config.clientId,
          hasClientSecret: !!this.config.clientSecret,
        },
        timestamp: new Date().toISOString(),
        action:
          'Set SARS_CLIENT_ID and SARS_CLIENT_SECRET environment variables to enable SARS eFiling',
      });
    } else {
      this.logger.log({
        message: 'SARS eFiling client initialized',
        mode: this.config.isSandbox ? 'SANDBOX' : 'PRODUCTION',
        baseUrl: this.config.baseUrl,
      });
    }
  }

  /**
   * Check if client is properly configured
   */
  getIsConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Authenticate with SARS eFiling portal
   *
   * @returns Access token for API calls
   * @throws BusinessException if not configured or authentication fails
   */
  async authenticate(): Promise<string> {
    // Fail fast if not configured
    if (!this.isConfigured) {
      this.logger.error({
        error: {
          message: 'Cannot authenticate - SARS eFiling credentials not configured',
          name: 'ConfigurationError',
        },
        file: 'sars-efiling.client.ts',
        function: 'authenticate',
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        'SARS eFiling credentials not configured. Set SARS_CLIENT_ID and SARS_CLIENT_SECRET environment variables.',
        'SARS_NOT_CONFIGURED',
      );
    }

    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    this.logger.log({
      message: 'Authenticating with SARS eFiling',
      mode: this.config.isSandbox ? 'SANDBOX' : 'PRODUCTION',
    });

    try {
      // SARS OAuth2 token request
      const response = await fetch(`${this.config.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error({
          error: {
            message: 'SARS authentication failed',
            name: 'AuthenticationError',
            statusCode: response.status,
          },
          file: 'sars-efiling.client.ts',
          function: 'authenticate',
          response: errorText,
          timestamp: new Date().toISOString(),
        });
        throw new BusinessException(
          `SARS authentication failed: ${response.status} ${response.statusText}`,
          'SARS_AUTH_FAILED',
        );
      }

      const data = await response.json();
      const token: string = data.access_token;
      this.accessToken = token;
      // Token expires in X seconds, refresh 60 seconds early
      this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

      this.logger.log('SARS authentication successful');
      return token;
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'sars-efiling.client.ts',
        function: 'authenticate',
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        `SARS authentication error: ${errorMessage}`,
        'SARS_AUTH_ERROR',
      );
    }
  }

  /**
   * Submit VAT201 return to SARS eFiling
   *
   * @param payload - VAT201 submission data
   * @param correlationId - Unique ID for request tracking
   * @returns SARS response with reference number
   * @throws BusinessException if submission fails
   */
  async submitVat201(
    payload: SarsSubmissionPayload,
    correlationId: string,
  ): Promise<SarsSubmissionResponse> {
    // Fail fast if not configured
    if (!this.isConfigured) {
      this.logger.error({
        error: {
          message: 'Cannot submit - SARS eFiling credentials not configured',
          name: 'ConfigurationError',
        },
        file: 'sars-efiling.client.ts',
        function: 'submitVat201',
        inputs: { correlationId },
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'SARS_NOT_CONFIGURED',
        errorMessage:
          'SARS eFiling credentials not configured. Set SARS_CLIENT_ID and SARS_CLIENT_SECRET environment variables.',
      };
    }

    this.logger.log({
      message: 'Submitting VAT201 to SARS',
      correlationId,
      vatNumber: this.maskVatNumber(payload.vatNumber),
      periodStart: payload.periodStart.toISOString().split('T')[0],
      periodEnd: payload.periodEnd.toISOString().split('T')[0],
      mode: this.config.isSandbox ? 'SANDBOX' : 'PRODUCTION',
    });

    try {
      const token = await this.authenticate();
      const xmlPayload = this.formatVat201Xml(payload);

      this.logger.debug({
        message: 'Sending VAT201 XML to SARS',
        correlationId,
        xmlLength: xmlPayload.length,
      });

      const response = await fetch(`${this.config.baseUrl}/vat/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/xml',
          'X-Correlation-ID': correlationId,
          Accept: 'application/json',
        },
        body: xmlPayload,
      });

      const responseText = await response.text();

      if (!response.ok) {
        this.logger.error({
          error: {
            message: 'SARS submission rejected',
            name: 'SubmissionError',
            statusCode: response.status,
          },
          file: 'sars-efiling.client.ts',
          function: 'submitVat201',
          inputs: { correlationId },
          response: responseText,
          timestamp: new Date().toISOString(),
        });

        // Parse SARS error response
        let errorCode = 'SARS_SUBMISSION_FAILED';
        let errorMessage = `SARS submission failed: ${response.status}`;

        try {
          const errorData = JSON.parse(responseText);
          errorCode = errorData.errorCode || errorCode;
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // Response wasn't JSON, use raw text
          errorMessage = responseText || errorMessage;
        }

        return {
          success: false,
          status: 'REJECTED',
          errorCode,
          errorMessage,
          rawResponse: responseText,
        };
      }

      // Parse successful response
      let responseData: { reference?: string; status?: string };
      try {
        responseData = JSON.parse(responseText);
      } catch {
        this.logger.warn({
          message: 'SARS response was not JSON, attempting XML parse',
          correlationId,
        });
        // Handle XML response if needed
        responseData = {
          reference: this.extractReferenceFromXml(responseText),
          status: 'ACCEPTED',
        };
      }

      this.logger.log({
        message: 'SARS submission successful',
        correlationId,
        reference: responseData.reference,
        status: responseData.status,
      });

      return {
        success: true,
        reference: responseData.reference,
        status: (responseData.status as 'ACCEPTED' | 'PENDING' | 'QUEUED') || 'ACCEPTED',
        rawResponse: responseText,
      };
    } catch (error) {
      if (error instanceof BusinessException) {
        return {
          success: false,
          status: 'REJECTED',
          errorCode: error.code,
          errorMessage: error.message,
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'sars-efiling.client.ts',
        function: 'submitVat201',
        inputs: { correlationId },
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'SARS_API_ERROR',
        errorMessage,
      };
    }
  }

  /**
   * Check submission status with SARS
   *
   * @param reference - SARS reference number
   * @returns Current submission status
   */
  async checkStatus(reference: string): Promise<SarsSubmissionResponse> {
    if (!this.isConfigured) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'SARS_NOT_CONFIGURED',
        errorMessage: 'SARS eFiling credentials not configured',
      };
    }

    this.logger.debug({
      message: 'Checking SARS submission status',
      reference,
    });

    try {
      const token = await this.authenticate();

      const response = await fetch(
        `${this.config.baseUrl}/vat/status/${encodeURIComponent(reference)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          reference,
          status: 'REJECTED',
          errorCode: `HTTP_${response.status}`,
          errorMessage: errorText || response.statusText,
        };
      }

      const data = await response.json();

      return {
        success: data.status !== 'REJECTED',
        reference,
        status: data.status || 'PENDING',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        reference,
        status: 'REJECTED',
        errorCode: 'STATUS_CHECK_ERROR',
        errorMessage,
      };
    }
  }

  /**
   * Format VAT201 data to SARS XML specification
   *
   * @param payload - VAT201 submission data
   * @returns XML string conforming to SARS VAT201 schema
   */
  private formatVat201Xml(payload: SarsSubmissionPayload): string {
    // Format dates as YYYY-MM-DD
    const periodStart = payload.periodStart.toISOString().split('T')[0];
    const periodEnd = payload.periodEnd.toISOString().split('T')[0];

    // Convert cents to Rand with 2 decimal places
    const toRand = (cents: number): string => (cents / 100).toFixed(2);

    // SARS VAT201 XML format
    // This follows the SARS eFiling XML specification
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VAT201 xmlns="http://www.sars.gov.za/vat/2021" version="1.0">
  <Header>
    <SubmissionType>VAT201</SubmissionType>
    <VATNumber>${this.escapeXml(payload.vatNumber)}</VATNumber>
    <TaxPeriod>
      <StartDate>${periodStart}</StartDate>
      <EndDate>${periodEnd}</EndDate>
    </TaxPeriod>
    <Timestamp>${new Date().toISOString()}</Timestamp>
  </Header>
  <Body>
    <OutputTax>
      <Field1_StandardRated>${toRand(payload.fields.field1OutputStandardCents)}</Field1_StandardRated>
      <Field2_ZeroRated>${toRand(payload.fields.field2ZeroRatedCents || 0)}</Field2_ZeroRated>
      <Field3_Exempt>${toRand(payload.fields.field3ExemptCents || 0)}</Field3_Exempt>
      <Field4_TotalOutput>${toRand(payload.fields.field4TotalOutputCents)}</Field4_TotalOutput>
    </OutputTax>
    <InputTax>
      <Field5_TotalInput>${toRand(payload.fields.field5InputTaxCents)}</Field5_TotalInput>
      <Field6_CapitalGoods>${toRand(payload.fields.field6CapitalGoodsCents || 0)}</Field6_CapitalGoods>
    </InputTax>
    <Calculation>
      <Field15_NetVAT>${toRand(payload.fields.field15NetVatCents)}</Field15_NetVAT>
      <Field19_TotalDue>${toRand(payload.fields.field19TotalDueCents)}</Field19_TotalDue>
    </Calculation>
  </Body>
</VAT201>`;

    return xml;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Extract reference number from XML response (fallback)
   */
  private extractReferenceFromXml(xml: string): string | undefined {
    const match = xml.match(/<Reference>([^<]+)<\/Reference>/);
    return match ? match[1] : undefined;
  }

  /**
   * Mask VAT number for logging (privacy)
   */
  private maskVatNumber(vatNumber: string): string {
    if (vatNumber.length <= 4) return '****';
    return vatNumber.substring(0, 2) + '****' + vatNumber.substring(vatNumber.length - 2);
  }
}
