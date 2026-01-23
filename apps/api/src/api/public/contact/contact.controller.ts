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
import { ContactService } from './contact.service';
import { CreateContactDto, ContactResponseDto } from './dto/contact.dto';

@ApiTags('Public - Contact')
@Controller('public/contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    limit: 5,
    windowSeconds: 300,
    keyPrefix: 'ratelimit:public:contact',
  })
  @ApiOperation({
    summary: 'Submit contact form',
    description: 'Public endpoint for submitting contact inquiries. Rate limited to 5 requests per 5 minutes.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contact form submitted successfully',
    type: ContactResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded',
  })
  async submitContact(
    @Body() dto: CreateContactDto,
  ): Promise<ContactResponseDto> {
    try {
      return await this.contactService.createContactSubmission(dto);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to submit contact form. Please try again later.',
      );
    }
  }
}
