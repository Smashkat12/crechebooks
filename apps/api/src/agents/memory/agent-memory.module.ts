/**
 * Agent Memory Module
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 * TASK-STUB-007: GNN Pattern Learner Integration
 *
 * @module agents/memory/agent-memory.module
 * @description NestJS module for the agent memory system.
 * Provides decision storage, correction handling, pattern learning,
 * and GNN-based graph pattern learning.
 */

import { Module } from '@nestjs/common';
import { AgentMemoryService } from './agent-memory.service';
import { PatternLearner } from './pattern-learner';
import { CorrectionHandler } from './correction-handler';
import { GraphBuilder } from './graph-builder';
import { GnnPatternAdapter, GNN_PATTERN_TOKEN } from './gnn-pattern-adapter';
import { PrismaModule } from '../../database/prisma';
import { SdkAgentModule } from '../sdk';

@Module({
  imports: [PrismaModule, SdkAgentModule],
  providers: [
    AgentMemoryService,
    PatternLearner,
    CorrectionHandler,
    GraphBuilder,
    GnnPatternAdapter,
    { provide: GNN_PATTERN_TOKEN, useExisting: GnnPatternAdapter },
  ],
  exports: [
    AgentMemoryService,
    PatternLearner,
    CorrectionHandler,
    GraphBuilder,
  ],
})
export class AgentMemoryModule {}
