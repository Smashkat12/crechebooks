/**
 * Ask Question DTO
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module api/conversational/dto/ask-question.dto
 * @description Request DTO for the conversational agent ask endpoint.
 */

import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class AskQuestionDto {
  /** The natural language question to ask about financial data */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  question: string;

  /** Optional conversation thread ID for multi-turn context */
  @IsString()
  @IsOptional()
  conversationId?: string;
}
