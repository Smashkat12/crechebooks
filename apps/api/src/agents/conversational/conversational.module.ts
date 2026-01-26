/**
 * Conversational Agent Module
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module agents/conversational/conversational.module
 * @description NestJS module for the conversational agent.
 * Provides ConversationalAgent and QueryValidator.
 * Includes the REST controller for API access.
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConversationalAgent } from './conversational.agent';
import { QueryValidator } from './query-validator';
import { DatabaseModule } from '../../database/database.module';
import { SdkAgentModule } from '../sdk/sdk-agent.module';
import { ConversationalController } from '../../api/conversational/conversational.controller';

@Module({
  imports: [forwardRef(() => DatabaseModule), SdkAgentModule],
  controllers: [ConversationalController],
  providers: [ConversationalAgent, QueryValidator],
  exports: [ConversationalAgent],
})
export class ConversationalModule {}
