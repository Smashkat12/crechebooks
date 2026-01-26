/**
 * CrecheBooks MCP Module
 * TASK-SDK-002: CrecheBooks In-Process MCP Server (Data Access Tools)
 *
 * NestJS module that provides the CrecheBooksMcpService.
 * Imports DatabaseModule for PrismaService and SdkAgentModule for RuvectorService.
 *
 * NOTE: This module imports SdkAgentModule to get RuvectorService.
 * SdkAgentModule does NOT import this module (avoids circular dependency).
 * Import CrecheBooksMcpModule where needed (e.g., OrchestratorModule or AppModule).
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SdkAgentModule } from '../../agents/sdk/sdk-agent.module';
import { CrecheBooksMcpService } from './server';

@Module({
  imports: [DatabaseModule, SdkAgentModule],
  providers: [CrecheBooksMcpService],
  exports: [CrecheBooksMcpService],
})
export class CrecheBooksMcpModule {}
