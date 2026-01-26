/**
 * Conversational Agent Controller
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module api/conversational/conversational.controller
 * @description REST endpoint for natural language financial queries.
 * Uses JwtAuthGuard for authentication and tenant isolation.
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { getTenantId } from '../auth/utils/tenant-assertions';
import type { IUser } from '../../database/entities/user.entity';
import { ConversationalAgent } from '../../agents/conversational/conversational.agent';
import { AskQuestionDto } from './dto/ask-question.dto';
import type { ConversationalResponse } from '../../agents/conversational/interfaces/conversational.interface';

@Controller('api/conversational')
@UseGuards(JwtAuthGuard)
export class ConversationalController {
  constructor(private readonly conversationalAgent: ConversationalAgent) {}

  /**
   * Ask a natural language question about financial data.
   *
   * @param dto - The question and optional conversation ID
   * @param user - The authenticated user (injected via @CurrentUser)
   * @returns Conversational response with answer and metadata
   */
  @Post('ask')
  async ask(
    @Body() dto: AskQuestionDto,
    @CurrentUser() user: IUser,
  ): Promise<ConversationalResponse> {
    const tenantId = getTenantId(user);
    return this.conversationalAgent.ask(
      dto.question,
      tenantId,
      dto.conversationId,
    );
  }
}
