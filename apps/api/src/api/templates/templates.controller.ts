/**
 * TemplatesController
 * TASK-TMPL-001: Tenant-Editable Message Templates
 *
 * @module api/templates
 * @description Read/write endpoints for MessageTemplate rows. Read endpoints
 * merge tenant overrides with coded defaults so the settings UI always sees
 * the complete key/channel matrix.
 *
 * Routes:
 *   GET    /templates?channel=…              List merged templates.
 *   GET    /templates/:key/:channel          One template (override or default).
 *   PUT    /templates/:key/:channel          Upsert override.
 *   DELETE /templates/:key/:channel          Revert to default.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseEnumPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  MessageTemplateChannel,
  MessageTemplateKey,
  UserRole,
} from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { getTenantId } from '../auth/utils/tenant-assertions';
import type { IUser } from '../../database/entities/user.entity';
import { TemplatesService } from './templates.service';
import {
  ListMessageTemplatesQueryDto,
  MessageTemplateResponseDto,
  UpsertMessageTemplateDto,
} from './dto/message-template.dto';

@ApiTags('Message Templates')
@ApiBearerAuth()
@Controller('templates')
@UseGuards(RolesGuard)
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name);

  constructor(private readonly service: TemplatesService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'List message templates',
    description:
      'Returns tenant overrides merged with coded defaults so the UI always sees the full template set.',
  })
  @ApiQuery({ name: 'channel', required: false, enum: MessageTemplateChannel })
  @ApiResponse({ status: 200, type: [MessageTemplateResponseDto] })
  async list(
    @CurrentUser() user: IUser,
    @Query() query: ListMessageTemplatesQueryDto,
  ): Promise<MessageTemplateResponseDto[]> {
    return this.service.list(getTenantId(user), query.channel);
  }

  @Get(':key/:channel')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get one message template' })
  @ApiParam({ name: 'key', enum: MessageTemplateKey })
  @ApiParam({ name: 'channel', enum: MessageTemplateChannel })
  @ApiResponse({ status: 200, type: MessageTemplateResponseDto })
  async findOne(
    @CurrentUser() user: IUser,
    @Param('key', new ParseEnumPipe(MessageTemplateKey))
    key: MessageTemplateKey,
    @Param('channel', new ParseEnumPipe(MessageTemplateChannel))
    channel: MessageTemplateChannel,
  ): Promise<MessageTemplateResponseDto> {
    return this.service.findOne(getTenantId(user), key, channel);
  }

  @Put(':key/:channel')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create or update a template override' })
  @ApiParam({ name: 'key', enum: MessageTemplateKey })
  @ApiParam({ name: 'channel', enum: MessageTemplateChannel })
  @ApiResponse({ status: 200, type: MessageTemplateResponseDto })
  async upsert(
    @CurrentUser() user: IUser,
    @Param('key', new ParseEnumPipe(MessageTemplateKey))
    key: MessageTemplateKey,
    @Param('channel', new ParseEnumPipe(MessageTemplateChannel))
    channel: MessageTemplateChannel,
    @Body() dto: UpsertMessageTemplateDto,
  ): Promise<MessageTemplateResponseDto> {
    return this.service.upsert(getTenantId(user), user.id, key, channel, dto);
  }

  @Delete(':key/:channel')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revert to default',
    description:
      'Removes the tenant override for this template and returns the coded default.',
  })
  @ApiParam({ name: 'key', enum: MessageTemplateKey })
  @ApiParam({ name: 'channel', enum: MessageTemplateChannel })
  @ApiResponse({ status: 200, type: MessageTemplateResponseDto })
  async remove(
    @CurrentUser() user: IUser,
    @Param('key', new ParseEnumPipe(MessageTemplateKey))
    key: MessageTemplateKey,
    @Param('channel', new ParseEnumPipe(MessageTemplateChannel))
    channel: MessageTemplateChannel,
  ): Promise<MessageTemplateResponseDto> {
    return this.service.delete(getTenantId(user), user.id, key, channel);
  }
}
