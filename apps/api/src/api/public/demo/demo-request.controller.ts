import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { RateLimit } from '../../../common/decorators';
import { DemoRequestService } from './demo-request.service';
import {
  CreateDemoRequestDto,
  DemoRequestResponseDto,
} from './dto/demo-request.dto';

@ApiTags('Public - Demo Request')
@Controller('public/demo-request')
export class DemoRequestController {
  constructor(private readonly demoRequestService: DemoRequestService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    limit: 5,
    windowSeconds: 300,
    keyPrefix: 'ratelimit:public:demo',
  })
  @ApiOperation({
    summary: 'Request a product demo',
    description:
      'Public endpoint for requesting a product demonstration. Rate limited to 5 requests per 5 minutes.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Demo request submitted successfully',
    type: DemoRequestResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded',
  })
  async requestDemo(
    @Body() dto: CreateDemoRequestDto,
  ): Promise<DemoRequestResponseDto> {
    try {
      return await this.demoRequestService.createDemoRequest(dto);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to submit demo request. Please try again later.',
      );
    }
  }
}
