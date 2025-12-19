<task_spec id="TASK-BILL-034" version="1.0">

<metadata>
  <title>Enrollment Controller</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>49</sequence>
  <implements>
    <requirement_ref>REQ-BILL-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the child enrollment endpoints for the CrecheBooks system. It implements
the REST API controller for enrolling new children, managing enrollments, and retrieving
child information. The controller handles fee structure assignment, enrollment dates, and
medical/emergency contact information.
</context>

<input_context_files>
  <file purpose="enrollment_service">src/core/billing/enrollment.service.ts</file>
  <file purpose="child_entity">src/core/billing/entities/child.entity.ts</file>
  <file purpose="enrollment_entity">src/core/billing/entities/enrollment.entity.ts</file>
  <file purpose="api_contracts">specs/technical/api-contracts.md#children</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-011 completed (Enrollment service)</check>
  <check>TASK-API-001 completed (Auth guards)</check>
  <check>Child and Enrollment entities created</check>
</prerequisites>

<scope>
  <in_scope>
    - Create ChildController with POST /children endpoint (enrollment)
    - Add GET /children endpoint (list children)
    - Add GET /children/:id endpoint (child details)
    - Add PUT /children/:id endpoint (update child/enrollment)
    - Create enrollment DTOs with validation
    - Support medical notes and emergency contacts
    - Add Swagger/OpenAPI annotations
    - Prevent duplicate enrollments
  </in_scope>
  <out_of_scope>
    - Fee structure management (separate module)
    - Parent management (separate module)
    - Attendance tracking (future feature)
    - Child photo uploads (future feature)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/billing/child.controller.ts">
      @Controller('children')
      @ApiTags('Children')
      @UseGuards(JwtAuthGuard)
      export class ChildController {
        @Post()
        @HttpCode(201)
        @ApiOperation({ summary: 'Enroll a new child' })
        @ApiResponse({ status: 201, type: EnrollChildResponseDto })
        @Roles(UserRole.OWNER, UserRole.ADMIN)
        @UseGuards(RolesGuard)
        async enrollChild(
          @Body() dto: EnrollChildDto,
          @CurrentUser() user: User
        ): Promise&lt;EnrollChildResponseDto&gt;;

        @Get()
        @ApiOperation({ summary: 'List all children' })
        @ApiResponse({ status: 200, type: ChildListResponseDto })
        async listChildren(
          @Query() query: ListChildrenQueryDto,
          @CurrentUser() user: User
        ): Promise&lt;ChildListResponseDto&gt;;

        @Get(':id')
        @ApiOperation({ summary: 'Get child details' })
        @ApiResponse({ status: 200, type: ChildResponseDto })
        async getChild(
          @Param('id') id: string,
          @CurrentUser() user: User
        ): Promise&lt;ChildResponseDto&gt;;

        @Put(':id')
        @ApiOperation({ summary: 'Update child information' })
        @ApiResponse({ status: 200, type: ChildResponseDto })
        @Roles(UserRole.OWNER, UserRole.ADMIN)
        @UseGuards(RolesGuard)
        async updateChild(
          @Param('id') id: string,
          @Body() dto: UpdateChildDto,
          @CurrentUser() user: User
        ): Promise&lt;ChildResponseDto&gt;;
      }
    </signature>
    <signature file="src/api/billing/dto/enroll-child.dto.ts">
      export class EnrollChildDto {
        @IsUUID()
        @ApiProperty()
        parent_id: string;

        @IsString()
        @MinLength(1)
        @MaxLength(100)
        @ApiProperty()
        first_name: string;

        @IsString()
        @MinLength(1)
        @MaxLength(100)
        @ApiProperty()
        last_name: string;

        @IsISO8601()
        @ApiProperty({ example: '2020-05-15' })
        date_of_birth: string;

        @IsOptional()
        @IsEnum(Gender)
        @ApiProperty({ enum: Gender, required: false })
        gender?: Gender;

        @IsUUID()
        @ApiProperty()
        fee_structure_id: string;

        @IsISO8601()
        @ApiProperty({ example: '2025-02-01' })
        start_date: string;

        @IsOptional()
        @IsString()
        @MaxLength(1000)
        @ApiProperty({ required: false })
        medical_notes?: string;

        @IsOptional()
        @IsString()
        @MaxLength(200)
        @ApiProperty({ required: false })
        emergency_contact?: string;

        @IsOptional()
        @IsString()
        @Matches(/^\+?[1-9]\d{1,14}$/)
        @ApiProperty({ required: false, example: '+27821234567' })
        emergency_phone?: string;
      }

      export class EnrollChildResponseDto {
        @ApiProperty()
        success: boolean;

        @ApiProperty()
        data: {
          child: ChildSummaryDto;
          enrollment: EnrollmentSummaryDto;
        };
      }
    </signature>
    <signature file="src/api/billing/dto/child-response.dto.ts">
      export class ChildResponseDto {
        @ApiProperty()
        id: string;

        @ApiProperty()
        first_name: string;

        @ApiProperty()
        last_name: string;

        @ApiProperty()
        date_of_birth: string;

        @ApiProperty({ enum: Gender })
        gender: Gender;

        @ApiProperty()
        parent: ParentSummaryDto;

        @ApiProperty()
        current_enrollment: EnrollmentDetailDto;

        @ApiProperty({ required: false })
        medical_notes?: string;

        @ApiProperty({ required: false })
        emergency_contact?: string;

        @ApiProperty({ required: false })
        emergency_phone?: string;

        @ApiProperty()
        created_at: Date;
      }

      export class EnrollmentDetailDto {
        @ApiProperty()
        id: string;

        @ApiProperty()
        fee_structure: {
          id: string;
          name: string;
          amount: number;
        };

        @ApiProperty()
        start_date: string;

        @ApiProperty({ required: false })
        end_date?: string;

        @ApiProperty({ enum: EnrollmentStatus })
        status: EnrollmentStatus;
      }
    </signature>
  </signatures>

  <constraints>
    - Only OWNER and ADMIN can enroll/update children
    - Must validate parent_id exists and belongs to tenant
    - Must validate fee_structure_id exists
    - Must prevent duplicate active enrollments for same child
    - date_of_birth must be in the past
    - start_date must be in the past or near future (within 3 months)
    - Phone number must be E.164 format
    - All DTOs must use class-validator decorators
    - All endpoints must have Swagger/OpenAPI documentation
  </constraints>

  <verification>
    - POST /children enrolls new child successfully
    - Validates parent_id exists
    - Validates fee_structure_id exists
    - Prevents duplicate enrollments
    - date_of_birth validation works
    - start_date validation works
    - Phone number format validation works
    - GET /children lists all children for tenant
    - GET /children/:id returns child details
    - PUT /children/:id updates child successfully
    - Only OWNER/ADMIN can POST/PUT (403 for others)
  </verification>
</definition_of_done>

<pseudo_code>
ChildController (src/api/billing/child.controller.ts):
  @Controller('children')
  @ApiTags('Children')
  @UseGuards(JwtAuthGuard)
  class ChildController:
    constructor(private enrollmentService: EnrollmentService)

    @Post()
    @HttpCode(201)
    @Roles(UserRole.OWNER, UserRole.ADMIN)
    async enrollChild(dto: EnrollChildDto, user: User):
      # Validate parent exists and belongs to tenant
      parent = await parentService.findOne(dto.parent_id, user.tenantId)
      if (!parent):
        throw new BadRequestException('Invalid parent_id')

      # Validate fee structure exists
      feeStructure = await feeStructureService.findOne(
        dto.fee_structure_id,
        user.tenantId
      )
      if (!feeStructure):
        throw new BadRequestException('Invalid fee_structure_id')

      # Validate dates
      dateOfBirth = new Date(dto.date_of_birth)
      if (dateOfBirth >= new Date()):
        throw new BadRequestException('date_of_birth must be in the past')

      startDate = new Date(dto.start_date)
      threeMonthsFuture = new Date()
      threeMonthsFuture.setMonth(threeMonthsFuture.getMonth() + 3)

      if (startDate > threeMonthsFuture):
        throw new BadRequestException(
          'start_date cannot be more than 3 months in the future'
        )

      # Check for existing active enrollment
      existingEnrollment = await enrollmentService.findActiveByChild(
        dto.parent_id,
        dto.first_name,
        dto.last_name,
        user.tenantId
      )

      if (existingEnrollment):
        throw new ConflictException('Child already has active enrollment')

      # Create child and enrollment
      result = await enrollmentService.enrollChild({
        parentId: dto.parent_id,
        firstName: dto.first_name,
        lastName: dto.last_name,
        dateOfBirth,
        gender: dto.gender,
        feeStructureId: dto.fee_structure_id,
        startDate,
        medicalNotes: dto.medical_notes,
        emergencyContact: dto.emergency_contact,
        emergencyPhone: dto.emergency_phone,
        tenantId: user.tenantId
      })

      return {
        success: true,
        data: {
          child: {
            id: result.child.id,
            first_name: result.child.firstName,
            last_name: result.child.lastName
          },
          enrollment: {
            id: result.enrollment.id,
            fee_structure: {
              name: feeStructure.name,
              amount: feeStructure.amount.toNumber()
            },
            start_date: result.enrollment.startDate.toISOString().split('T')[0],
            status: result.enrollment.status
          }
        }
      }

    @Get()
    async listChildren(query: ListChildrenQueryDto, user: User):
      children = await enrollmentService.findAllChildren({
        tenantId: user.tenantId,
        status: query.status,
        page: query.page || 1,
        limit: query.limit || 20
      })

      return {
        success: true,
        data: children.items.map(transformChildDto),
        meta: {
          page: children.page,
          limit: children.limit,
          total: children.total,
          totalPages: Math.ceil(children.total / children.limit)
        }
      }

    @Get(':id')
    async getChild(id: string, user: User):
      child = await enrollmentService.findChildById(id, user.tenantId)

      if (!child):
        throw new NotFoundException('Child not found')

      return {
        success: true,
        data: transformChildDto(child)
      }

    @Put(':id')
    @Roles(UserRole.OWNER, UserRole.ADMIN)
    async updateChild(id: string, dto: UpdateChildDto, user: User):
      child = await enrollmentService.updateChild({
        id,
        ...dto,
        tenantId: user.tenantId
      })

      return {
        success: true,
        data: transformChildDto(child)
      }
</pseudo_code>

<files_to_create>
  <file path="src/api/billing/child.controller.ts">Child enrollment controller</file>
  <file path="src/api/billing/dto/enroll-child.dto.ts">Enrollment request/response DTOs</file>
  <file path="src/api/billing/dto/child-response.dto.ts">Child response DTO</file>
  <file path="src/api/billing/dto/update-child.dto.ts">Update child DTO</file>
  <file path="src/api/billing/dto/list-children.dto.ts">List children query DTO</file>
  <file path="src/api/billing/dto/enrollment-detail.dto.ts">Enrollment detail DTO</file>
  <file path="tests/api/billing/child.controller.spec.ts">Child controller unit tests</file>
  <file path="tests/api/billing/child.e2e-spec.ts">Child enrollment E2E tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/billing/billing.module.ts">Import ChildController</file>
</files_to_modify>

<validation_criteria>
  <criterion>POST /children enrolls child successfully</criterion>
  <criterion>Validates parent_id and fee_structure_id</criterion>
  <criterion>Prevents duplicate active enrollments</criterion>
  <criterion>Date validations work correctly</criterion>
  <criterion>Phone number format validated</criterion>
  <criterion>GET /children lists children with pagination</criterion>
  <criterion>GET /children/:id returns child details</criterion>
  <criterion>PUT /children/:id updates child</criterion>
  <criterion>Role guards enforce OWNER/ADMIN for POST/PUT</criterion>
  <criterion>All tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- child.controller.spec</command>
  <command>npm run test:e2e -- child.e2e-spec</command>
  <command>curl -X POST -H "Authorization: Bearer TOKEN" -d '{"parent_id":"uuid","first_name":"Emily","last_name":"Smith","date_of_birth":"2020-05-15","fee_structure_id":"uuid","start_date":"2025-02-01"}' http://localhost:3000/v1/children</command>
  <command>curl -H "Authorization: Bearer TOKEN" http://localhost:3000/v1/children</command>
  <command>curl -H "Authorization: Bearer TOKEN" http://localhost:3000/v1/children/UUID</command>
</test_commands>

</task_spec>
