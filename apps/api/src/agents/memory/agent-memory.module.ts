/**
 * Agent Memory Module
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 *
 * @module agents/memory/agent-memory.module
 * @description NestJS module for the agent memory system.
 * Provides decision storage, correction handling, and pattern learning.
 */

import { Module } from '@nestjs/common';
import { AgentMemoryService } from './agent-memory.service';
import { PatternLearner } from './pattern-learner';
import { CorrectionHandler } from './correction-handler';
import { PrismaModule } from '../../database/prisma';
import { SdkAgentModule } from '../sdk';

@Module({
  imports: [PrismaModule, SdkAgentModule],
  providers: [AgentMemoryService, PatternLearner, CorrectionHandler],
  exports: [AgentMemoryService, PatternLearner, CorrectionHandler],
})
export class AgentMemoryModule {}
