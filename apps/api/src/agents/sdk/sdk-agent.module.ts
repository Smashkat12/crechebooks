/**
 * SDK Agent Module
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * @module agents/sdk/sdk-agent.module
 * @description NestJS module for the SDK agent integration layer.
 * Provides SdkAgentFactory, SdkConfigService, and RuvectorService
 * to any module that imports SdkAgentModule.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SdkAgentFactory } from './sdk-agent.factory';
import { SdkConfigService } from './sdk-config';
import { RuvectorService } from './ruvector.service';

@Module({
  imports: [ConfigModule],
  providers: [SdkAgentFactory, SdkConfigService, RuvectorService],
  exports: [SdkAgentFactory, SdkConfigService, RuvectorService],
})
export class SdkAgentModule {}
