/**
 * Africa's Talking SMS Gateway
 * TASK-NOTIF-002: SMS Gateway Integration
 *
 * Production SMS gateway for South Africa using Africa's Talking API.
 * - E.164 phone number format (+27...)
 * - Sender ID support (max 11 alphanumeric chars)
 * - Status mapping to standard SmsGatewayResult
 * - Comprehensive error handling with fail-fast logging
 *
 * @see https://developers.africastalking.com/docs/sms/overview
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ISmsGateway,
  SmsGatewayOptions,
  SmsGatewayResult,
  SmsDeliveryStatus,
} from '../interfaces/sms-gateway.interface';
import { BusinessException } from '../../shared/exceptions';

/** Africa's Talking SMS result recipient structure */
interface ATRecipient {
  number: string;
  status: string;
  statusCode: number;
  messageId: string;
  cost?: string;
}

/** Africa's Talking SMS response structure */
interface ATSmsResponse {
  SMSMessageData: {
    Message: string;
    Recipients: ATRecipient[];
  };
}

/** Africa's Talking SDK client type */
interface ATSmsClient {
  send(options: {
    to: string[];
    message: string;
    from?: string;
  }): Promise<ATSmsResponse>;
}

/** Africa's Talking SDK type */
interface AfricasTalkingSDK {
  SMS: ATSmsClient;
}

@Injectable()
export class AfricasTalkingSmsGateway implements ISmsGateway {
  private readonly logger = new Logger(AfricasTalkingSmsGateway.name);
  private readonly sms: ATSmsClient | null = null;
  private readonly senderId: string;
  private readonly configured: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('AFRICASTALKING_API_KEY');
    const username = this.configService.get<string>(
      'AFRICASTALKING_USERNAME',
      'sandbox',
    );

    this.senderId = this.configService.get<string>(
      'SMS_SENDER_ID',
      'CrecheBooks',
    );

    // Validate configuration
    if (!apiKey) {
      this.logger.error({
        error: {
          message: "Africa's Talking API key not configured",
          name: 'ConfigurationError',
        },
        file: 'africastalking-sms.gateway.ts',
        function: 'constructor',
        inputs: { hasApiKey: false, hasUsername: !!username },
        timestamp: new Date().toISOString(),
      });
      this.configured = false;
      return;
    }

    try {
      // Dynamic import to avoid issues if package not installed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AfricasTalking = require('africastalking');
      const client: AfricasTalkingSDK = AfricasTalking({
        apiKey,
        username,
      });
      this.sms = client.SMS;
      this.configured = true;

      this.logger.log({
        message: "Africa's Talking SMS gateway initialized",
        username,
        senderId: this.senderId,
        mode: username === 'sandbox' ? 'SANDBOX' : 'PRODUCTION',
      });
    } catch (error) {
      this.logger.error({
        error: {
          message:
            error instanceof Error ? error.message : 'Failed to initialize SDK',
          name: error instanceof Error ? error.name : 'InitializationError',
        },
        file: 'africastalking-sms.gateway.ts',
        function: 'constructor',
        timestamp: new Date().toISOString(),
      });
      this.configured = false;
    }
  }

  /**
   * Check if gateway is configured and ready
   */
  isConfigured(): boolean {
    return this.configured && this.sms !== null;
  }

  /**
   * Send SMS via Africa's Talking API
   *
   * @param to - Phone number in E.164 format (+27...)
   * @param message - SMS content (max 160 chars for single SMS)
   * @param options - Optional sender configuration
   * @returns Result with message ID and delivery status
   */
  async send(
    to: string,
    message: string,
    options?: SmsGatewayOptions,
  ): Promise<SmsGatewayResult> {
    const startTime = Date.now();

    // Fail-fast: Check configuration
    if (!this.isConfigured()) {
      this.logger.error({
        error: {
          message: "Africa's Talking gateway not configured",
          name: 'GatewayNotConfigured',
        },
        file: 'africastalking-sms.gateway.ts',
        function: 'send',
        inputs: { to: this.maskPhone(to) },
        timestamp: new Date().toISOString(),
      });

      return {
        messageId: '',
        status: 'failed',
        errorCode: 'GATEWAY_NOT_CONFIGURED',
        errorMessage:
          "Africa's Talking gateway not configured. Check AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME environment variables.",
      };
    }

    try {
      // Validate phone format (must be E.164)
      if (!to.startsWith('+')) {
        throw new BusinessException(
          `Phone number must be in E.164 format (got: ${to})`,
          'INVALID_PHONE_FORMAT',
        );
      }

      // Log outgoing request
      this.logger.debug({
        message: 'Sending SMS via Africa\'s Talking',
        to: this.maskPhone(to),
        senderId: options?.senderId || this.senderId,
        messageLength: message.length,
        segments: Math.ceil(message.length / 160),
      });

      // Send SMS
      const result = await this.sms!.send({
        to: [to],
        message,
        from: options?.senderId || this.senderId,
      });

      // Process response
      const recipient = result.SMSMessageData?.Recipients?.[0];

      if (!recipient) {
        this.logger.error({
          error: {
            message: 'No recipient data in API response',
            name: 'InvalidApiResponse',
          },
          file: 'africastalking-sms.gateway.ts',
          function: 'send',
          inputs: { to: this.maskPhone(to) },
          response: result,
          timestamp: new Date().toISOString(),
        });

        return {
          messageId: result.SMSMessageData?.Message || 'unknown',
          status: 'failed',
          errorCode: 'NO_RECIPIENT_DATA',
          errorMessage:
            'No recipient data returned from API. Check phone number validity.',
        };
      }

      // Map Africa's Talking status to standard status
      const status = this.mapStatus(recipient.status, recipient.statusCode);

      const duration = Date.now() - startTime;

      // Log success or failure
      if (status === 'sent' || status === 'queued' || status === 'delivered') {
        this.logger.log({
          message: 'SMS sent successfully',
          to: this.maskPhone(to),
          messageId: recipient.messageId,
          status,
          statusCode: recipient.statusCode,
          cost: recipient.cost,
          duration: `${duration}ms`,
        });
      } else {
        this.logger.warn({
          message: 'SMS delivery failed',
          to: this.maskPhone(to),
          messageId: recipient.messageId,
          status,
          statusCode: recipient.statusCode,
          rawStatus: recipient.status,
          duration: `${duration}ms`,
        });
      }

      return {
        messageId: recipient.messageId,
        status,
        errorCode:
          status === 'failed' || status === 'rejected'
            ? recipient.statusCode?.toString()
            : undefined,
        errorMessage:
          status === 'failed' || status === 'rejected'
            ? recipient.status
            : undefined,
        cost: recipient.cost ? this.parseCost(recipient.cost) : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof BusinessException ? error.code : 'API_ERROR';

      this.logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
          code: errorCode,
        },
        file: 'africastalking-sms.gateway.ts',
        function: 'send',
        inputs: { to: this.maskPhone(to) },
        timestamp: new Date().toISOString(),
      });

      return {
        messageId: '',
        status: 'failed',
        errorCode,
        errorMessage,
      };
    }
  }

  /**
   * Map Africa's Talking status to standard SmsDeliveryStatus
   *
   * Status codes from AT:
   * - 100: Processed (sent to mobile networks)
   * - 101: Sent (accepted by mobile network)
   * - 102: Queued (scheduled for later delivery)
   * - 401: RiskHold (flagged for manual review)
   * - 402: InvalidSenderId
   * - 403: InvalidPhoneNumber
   * - 404: UnsupportedNumberType
   * - 405: InsufficientBalance
   * - 406: UserInBlacklist
   * - 407: CouldNotRoute
   * - 500: InternalServerError
   * - 501: GatewayError
   * - 502: RejectedByGateway
   */
  private mapStatus(
    atStatus: string,
    statusCode: number,
  ): SmsDeliveryStatus {
    // Handle by status code first (more reliable)
    switch (statusCode) {
      case 100:
      case 101:
        return 'sent';
      case 102:
        return 'queued';
      case 200:
        return 'delivered';
      case 401:
      case 402:
      case 403:
      case 404:
      case 405:
      case 406:
      case 407:
        return 'rejected';
      case 500:
      case 501:
      case 502:
        return 'failed';
      default:
        break;
    }

    // Fallback to status string
    const normalizedStatus = atStatus?.toLowerCase() || '';

    if (
      normalizedStatus.includes('success') ||
      normalizedStatus.includes('sent')
    ) {
      return 'sent';
    }
    if (normalizedStatus.includes('queued')) {
      return 'queued';
    }
    if (normalizedStatus.includes('delivered')) {
      return 'delivered';
    }
    if (
      normalizedStatus.includes('rejected') ||
      normalizedStatus.includes('invalid')
    ) {
      return 'rejected';
    }

    // Default to failed for unknown statuses
    return 'failed';
  }

  /**
   * Parse cost string from AT response (e.g., "KES 0.80")
   */
  private parseCost(costString: string): number | undefined {
    const match = costString.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : undefined;
  }

  /**
   * Mask phone number for logging (privacy)
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 6) return '***';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
  }
}
