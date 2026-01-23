import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { RateLimit } from '../../../common/decorators';
import { SignupService } from './signup.service';
import { SignupDto, SignupResponseDto } from './dto/signup.dto';

@ApiTags('Public - Signup')
@Controller('public/signup')
export class SignupController {
  constructor(private readonly signupService: SignupService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({
    limit: 3,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:public:signup',
  })
  @ApiOperation({
    summary: 'Sign up for trial account',
    description:
      'Public endpoint for creating a new trial account. Creates tenant and admin user. Rate limited to 3 requests per hour.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Trial account created successfully',
    type: SignupResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data or signup failed',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already exists',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded',
  })
  async signup(@Body() dto: SignupDto): Promise<SignupResponseDto> {
    try {
      return await this.signupService.signup(dto);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to create trial account. Please try again later.',
      );
    }
  }
}
