/**
 * Mock SMS Gateway
 * TASK-NOTIF-001: SMS Channel Adapter Implementation
 *
 * Mock implementation for testing and development.
 * Replace with AfricasTalkingSmsGateway or TwilioSmsGateway in production.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ISmsGateway,
  SmsGatewayOptions,
  SmsGatewayResult,
} from '../interfaces/sms-gateway.interface';

@Injectable()
export class MockSmsGateway implements ISmsGateway {
  private readonly logger = new Logger(MockSmsGateway.name);
  private messageCounter = 0;

  /**
   * Check if gateway is configured (mock always returns true)
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Send SMS via mock gateway
   * Simulates sending with configurable behavior for testing
   */
  async send(
    to: string,
    message: string,
    options?: SmsGatewayOptions,
  ): Promise<SmsGatewayResult> {
    // Simulate network delay
    await this.simulateDelay(100);

    this.messageCounter++;
    const messageId = `mock-sms-${Date.now()}-${this.messageCounter}`;

    // Simulate failure for specific test numbers
    if (to.endsWith('0000000000')) {
      this.logger.warn(`[MOCK] Simulated failure for test number: ${to}`);
      return {
        messageId: '',
        status: 'failed',
        errorCode: 'MOCK_FAILURE',
        errorMessage: 'Simulated failure for testing',
      };
    }

    // Simulate rejection for invalid numbers
    if (to.endsWith('1111111111')) {
      this.logger.warn(`[MOCK] Simulated rejection for invalid number: ${to}`);
      return {
        messageId: '',
        status: 'rejected',
        errorCode: 'INVALID_NUMBER',
        errorMessage: 'Phone number rejected by carrier',
      };
    }

    this.logger.log({
      message: '[MOCK] SMS sent successfully',
      to,
      messageId,
      senderId: options?.senderId || 'Notify',
      messageLength: message.length,
      priority: options?.priority || 'normal',
    });

    return {
      messageId,
      status: 'sent',
      cost: Math.ceil(message.length / 160), // Cost per SMS segment
    };
  }

  /**
   * Simulate network delay
   */
  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
