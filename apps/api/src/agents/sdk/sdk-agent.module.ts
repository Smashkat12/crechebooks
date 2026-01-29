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
import { ClaudeClientService } from './claude-client.service';
import { IntelligenceEngineService } from './intelligence-engine.service';
import { PersistenceConfig } from './persistence-config';
import { SonaBootstrapService } from './sona-bootstrap.service';

@Module({
  // PrismaService is globally available via PrismaModule (@Global),
  // so no need to import DatabaseModule (which would create circular deps).
  imports: [ConfigModule],
  providers: [
    SdkAgentFactory,
    SdkConfigService,
    RuvectorService,
    ClaudeClientService,
    IntelligenceEngineService,
    PersistenceConfig,
    SonaBootstrapService,
  ],
  exports: [
    SdkAgentFactory,
    SdkConfigService,
    RuvectorService,
    ClaudeClientService,
    IntelligenceEngineService,
    PersistenceConfig,
    SonaBootstrapService,
  ],
})
export class SdkAgentModule {}
