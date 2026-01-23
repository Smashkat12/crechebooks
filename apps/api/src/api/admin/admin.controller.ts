import { Controller, Get, Patch, Param, Body, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  ContactSubmissionsResponseDto,
  DemoRequestsResponseDto,
} from './dto/submissions.dto';

@Controller('admin')
@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get('contact-submissions')
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary: 'Get all contact form submissions',
    description:
      'Returns all contact form submissions for CrecheBooks administrators to review and respond to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact submissions retrieved successfully',
    type: ContactSubmissionsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - OWNER role required',
  })
  async getContactSubmissions(): Promise<ContactSubmissionsResponseDto> {
    this.logger.debug('Getting contact submissions');
    return this.adminService.getContactSubmissions();
  }

  @Get('demo-requests')
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary: 'Get all demo requests',
    description:
      'Returns all demo requests for CrecheBooks administrators to review and schedule demos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Demo requests retrieved successfully',
    type: DemoRequestsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - OWNER role required',
  })
  async getDemoRequests(): Promise<DemoRequestsResponseDto> {
    this.logger.debug('Getting demo requests');
    return this.adminService.getDemoRequests();
  }

  @Patch('contact-submissions/:id/status')
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary: 'Update contact submission status',
    description: 'Allows administrators to mark contact submissions as contacted or resolved.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status updated successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - OWNER role required',
  })
  async updateContactSubmissionStatus(
    @Param('id') id: string,
    @Body('status') status: 'PENDING' | 'CONTACTED',
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Updating contact submission ${id} status to ${status}`);
    await this.adminService.updateContactSubmissionStatus(id, status);
    return {
      success: true,
      message: `Contact submission status updated to ${status}`,
    };
  }

  @Patch('demo-requests/:id/status')
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary: 'Update demo request status',
    description: 'Allows administrators to mark demo requests as contacted, scheduled, completed, or cancelled.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status updated successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - OWNER role required',
  })
  async updateDemoRequestStatus(
    @Param('id') id: string,
    @Body('status') status: 'PENDING' | 'CONTACTED',
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Updating demo request ${id} status to ${status}`);
    await this.adminService.updateDemoRequestStatus(id, status);
    return {
      success: true,
      message: `Demo request status updated to ${status}`,
    };
  }
}
