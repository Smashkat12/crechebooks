<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-STAFF-005</task_id>
    <title>Make Tax Tables Configurable</title>
    <priority>HIGH</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>configuration</category>
    <estimated_effort>6 hours</estimated_effort>
    <assignee>unassigned</assignee>
    <created_date>2026-01-15</created_date>
    <due_date>2026-01-28</due_date>
    <tags>tax, configuration, sars, compliance, admin-ui</tags>
  </metadata>

  <context>
    <problem_statement>
      The 2024/2025 South African tax brackets are hardcoded in the payroll calculation
      logic. This means every tax year requires a code deployment to update the brackets,
      creating operational overhead and potential delays in applying new tax rates at the
      start of each tax year (March 1st).
    </problem_statement>

    <business_impact>
      - Code deployment required annually to update tax brackets
      - Risk of incorrect tax calculations if update is delayed
      - No ability for admins to preview/prepare next year's rates
      - Cannot easily support backdated calculations with historical rates
      - Compliance risk if tax updates are not applied promptly
    </business_impact>

    <technical_background>
      SARS publishes new tax brackets annually, effective from March 1st. The tax tables
      include income brackets, tax rates, rebates, and thresholds. These should be stored
      in the database or configuration files rather than hardcoded, with an admin interface
      for management.
    </technical_background>

    <dependencies>
      - Database migrations for tax table storage
      - Admin authentication/authorization
      - Audit logging for tax table changes
    </dependencies>
  </context>

  <scope>
    <in_scope>
      <item>Move tax brackets to database/config storage</item>
      <item>Support multiple tax years with effective dates</item>
      <item>Create admin API endpoints for tax table management</item>
      <item>Add validation for tax table data</item>
      <item>Implement tax year selection in payroll calculations</item>
      <item>Add audit logging for tax table changes</item>
    </in_scope>

    <out_of_scope>
      <item>Full admin dashboard UI (frontend task)</item>
      <item>Tax bracket import from SARS documents</item>
      <item>Multi-country tax support</item>
    </out_of_scope>

    <affected_files>
      <file action="modify">apps/api/src/payroll/tax-tables.ts</file>
      <file action="create">apps/api/src/payroll/entities/tax-bracket.entity.ts</file>
      <file action="create">apps/api/src/payroll/entities/tax-year.entity.ts</file>
      <file action="create">apps/api/src/payroll/tax-tables.service.ts</file>
      <file action="create">apps/api/src/payroll/tax-tables.controller.ts</file>
      <file action="create">apps/api/src/payroll/dto/tax-table.dto.ts</file>
      <file action="modify">apps/api/src/payroll/payroll-calculator.service.ts</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Create database entities for tax years and brackets with effective date ranges.
      Build a service layer for tax table management with caching for performance.
      Expose admin API endpoints with proper authorization and audit logging.
    </approach>

    <steps>
      <step order="1">
        <description>Create tax year entity</description>
        <details>
          ```typescript
          // tax-year.entity.ts
          import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';

          @Entity('tax_years')
          export class TaxYear {
            @PrimaryGeneratedColumn('uuid')
            id: string;

            @Column({ unique: true })
            yearCode: string; // e.g., '2024/2025'

            @Column({ type: 'date' })
            effectiveFrom: Date; // e.g., 2024-03-01

            @Column({ type: 'date' })
            effectiveTo: Date; // e.g., 2025-02-28

            @Column({ default: true })
            isActive: boolean;

            @Column({ type: 'decimal', precision: 10, scale: 2 })
            primaryRebate: number; // Primary tax rebate

            @Column({ type: 'decimal', precision: 10, scale: 2 })
            secondaryRebate: number; // Age 65+ rebate

            @Column({ type: 'decimal', precision: 10, scale: 2 })
            tertiaryRebate: number; // Age 75+ rebate

            @Column({ type: 'decimal', precision: 10, scale: 2 })
            taxThreshold: number; // Below this, no tax

            @Column({ type: 'decimal', precision: 10, scale: 2 })
            taxThresholdOver65: number;

            @Column({ type: 'decimal', precision: 10, scale: 2 })
            taxThresholdOver75: number;

            @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
            medicalCreditsMain: number; // Medical aid tax credits

            @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
            medicalCreditsFirstDependent: number;

            @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
            medicalCreditsOtherDependents: number;

            @OneToMany(() => TaxBracket, bracket => bracket.taxYear)
            brackets: TaxBracket[];

            @CreateDateColumn()
            createdAt: Date;

            @UpdateDateColumn()
            updatedAt: Date;

            @Column({ nullable: true })
            createdBy: string;

            @Column({ nullable: true })
            updatedBy: string;
          }
          ```
        </details>
      </step>

      <step order="2">
        <description>Create tax bracket entity</description>
        <details>
          ```typescript
          // tax-bracket.entity.ts
          @Entity('tax_brackets')
          export class TaxBracket {
            @PrimaryGeneratedColumn('uuid')
            id: string;

            @ManyToOne(() => TaxYear, taxYear => taxYear.brackets)
            @JoinColumn({ name: 'tax_year_id' })
            taxYear: TaxYear;

            @Column()
            taxYearId: string;

            @Column({ type: 'decimal', precision: 12, scale: 2 })
            lowerBound: number; // Income from

            @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
            upperBound: number; // Income to (null for highest bracket)

            @Column({ type: 'decimal', precision: 12, scale: 2 })
            baseTax: number; // Fixed tax amount at lower bound

            @Column({ type: 'decimal', precision: 5, scale: 2 })
            marginalRate: number; // Rate as percentage (e.g., 45.00 for 45%)

            @Column()
            bracketOrder: number; // For ordering brackets
          }
          ```
        </details>
      </step>

      <step order="3">
        <description>Create DTOs for tax table management</description>
        <details>
          ```typescript
          // tax-table.dto.ts
          import { IsString, IsNumber, IsDate, IsArray, ValidateNested, Min, Max, IsOptional, IsBoolean } from 'class-validator';
          import { Type } from 'class-transformer';

          export class TaxBracketDto {
            @IsNumber()
            @Min(0)
            lowerBound: number;

            @IsNumber()
            @IsOptional()
            @Min(0)
            upperBound?: number;

            @IsNumber()
            @Min(0)
            baseTax: number;

            @IsNumber()
            @Min(0)
            @Max(100)
            marginalRate: number;

            @IsNumber()
            @Min(1)
            bracketOrder: number;
          }

          export class CreateTaxYearDto {
            @IsString()
            yearCode: string; // e.g., '2025/2026'

            @IsDate()
            @Type(() => Date)
            effectiveFrom: Date;

            @IsDate()
            @Type(() => Date)
            effectiveTo: Date;

            @IsNumber()
            @Min(0)
            primaryRebate: number;

            @IsNumber()
            @Min(0)
            secondaryRebate: number;

            @IsNumber()
            @Min(0)
            tertiaryRebate: number;

            @IsNumber()
            @Min(0)
            taxThreshold: number;

            @IsNumber()
            @Min(0)
            taxThresholdOver65: number;

            @IsNumber()
            @Min(0)
            taxThresholdOver75: number;

            @IsNumber()
            @IsOptional()
            medicalCreditsMain?: number;

            @IsNumber()
            @IsOptional()
            medicalCreditsFirstDependent?: number;

            @IsNumber()
            @IsOptional()
            medicalCreditsOtherDependents?: number;

            @IsArray()
            @ValidateNested({ each: true })
            @Type(() => TaxBracketDto)
            brackets: TaxBracketDto[];
          }

          export class UpdateTaxYearDto extends PartialType(CreateTaxYearDto) {
            @IsBoolean()
            @IsOptional()
            isActive?: boolean;
          }
          ```
        </details>
      </step>

      <step order="4">
        <description>Implement tax tables service with caching</description>
        <details>
          ```typescript
          // tax-tables.service.ts
          import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
          import { InjectRepository } from '@nestjs/typeorm';
          import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
          import { Cache } from 'cache-manager';
          import { CACHE_MANAGER, Inject } from '@nestjs/common';

          @Injectable()
          export class TaxTablesService {
            private readonly logger = new Logger(TaxTablesService.name);
            private readonly CACHE_KEY = 'tax-tables';
            private readonly CACHE_TTL = 3600; // 1 hour

            constructor(
              @InjectRepository(TaxYear)
              private readonly taxYearRepository: Repository<TaxYear>,
              @InjectRepository(TaxBracket)
              private readonly taxBracketRepository: Repository<TaxBracket>,
              @Inject(CACHE_MANAGER)
              private readonly cacheManager: Cache
            ) {}

            async getTaxYearForDate(date: Date): Promise<TaxYear> {
              const cacheKey = `${this.CACHE_KEY}:${date.toISOString().split('T')[0]}`;
              const cached = await this.cacheManager.get<TaxYear>(cacheKey);

              if (cached) {
                return cached;
              }

              const taxYear = await this.taxYearRepository.findOne({
                where: {
                  effectiveFrom: LessThanOrEqual(date),
                  effectiveTo: MoreThanOrEqual(date),
                  isActive: true
                },
                relations: ['brackets'],
                order: { brackets: { bracketOrder: 'ASC' } }
              });

              if (!taxYear) {
                throw new NotFoundException(`No tax year found for date: ${date}`);
              }

              await this.cacheManager.set(cacheKey, taxYear, this.CACHE_TTL);
              return taxYear;
            }

            async getCurrentTaxYear(): Promise<TaxYear> {
              return this.getTaxYearForDate(new Date());
            }

            async createTaxYear(dto: CreateTaxYearDto, userId: string): Promise<TaxYear> {
              // Validate no overlap with existing years
              const overlapping = await this.taxYearRepository.findOne({
                where: [
                  { effectiveFrom: LessThanOrEqual(dto.effectiveTo), effectiveTo: MoreThanOrEqual(dto.effectiveFrom) }
                ]
              });

              if (overlapping) {
                throw new BadRequestException(`Tax year overlaps with existing year: ${overlapping.yearCode}`);
              }

              // Validate brackets
              this.validateBrackets(dto.brackets);

              const taxYear = this.taxYearRepository.create({
                ...dto,
                createdBy: userId,
                updatedBy: userId
              });

              const saved = await this.taxYearRepository.save(taxYear);

              // Create brackets
              const brackets = dto.brackets.map(b =>
                this.taxBracketRepository.create({
                  ...b,
                  taxYearId: saved.id
                })
              );

              await this.taxBracketRepository.save(brackets);

              // Clear cache
              await this.clearCache();

              this.logger.log(`Tax year ${dto.yearCode} created by ${userId}`);

              return this.getTaxYearById(saved.id);
            }

            async updateTaxYear(id: string, dto: UpdateTaxYearDto, userId: string): Promise<TaxYear> {
              const existing = await this.getTaxYearById(id);

              if (dto.brackets) {
                this.validateBrackets(dto.brackets);

                // Delete existing brackets and create new ones
                await this.taxBracketRepository.delete({ taxYearId: id });

                const brackets = dto.brackets.map(b =>
                  this.taxBracketRepository.create({
                    ...b,
                    taxYearId: id
                  })
                );

                await this.taxBracketRepository.save(brackets);
              }

              await this.taxYearRepository.update(id, {
                ...dto,
                brackets: undefined, // Don't update via relation
                updatedBy: userId
              });

              await this.clearCache();

              this.logger.log(`Tax year ${existing.yearCode} updated by ${userId}`);

              return this.getTaxYearById(id);
            }

            async getAllTaxYears(): Promise<TaxYear[]> {
              return this.taxYearRepository.find({
                relations: ['brackets'],
                order: { effectiveFrom: 'DESC' }
              });
            }

            async getTaxYearById(id: string): Promise<TaxYear> {
              const taxYear = await this.taxYearRepository.findOne({
                where: { id },
                relations: ['brackets'],
                order: { brackets: { bracketOrder: 'ASC' } }
              });

              if (!taxYear) {
                throw new NotFoundException(`Tax year not found: ${id}`);
              }

              return taxYear;
            }

            private validateBrackets(brackets: TaxBracketDto[]): void {
              if (brackets.length === 0) {
                throw new BadRequestException('At least one tax bracket is required');
              }

              // Sort by order
              const sorted = [...brackets].sort((a, b) => a.bracketOrder - b.bracketOrder);

              // Validate continuous ranges
              for (let i = 0; i < sorted.length - 1; i++) {
                const current = sorted[i];
                const next = sorted[i + 1];

                if (current.upperBound !== next.lowerBound) {
                  throw new BadRequestException(
                    `Gap between bracket ${i + 1} upper bound (${current.upperBound}) and bracket ${i + 2} lower bound (${next.lowerBound})`
                  );
                }
              }

              // Last bracket should have no upper bound
              if (sorted[sorted.length - 1].upperBound !== null && sorted[sorted.length - 1].upperBound !== undefined) {
                throw new BadRequestException('Highest bracket should not have an upper bound');
              }
            }

            private async clearCache(): Promise<void> {
              const keys = await this.cacheManager.store.keys(`${this.CACHE_KEY}:*`);
              await Promise.all(keys.map(key => this.cacheManager.del(key)));
            }
          }
          ```
        </details>
      </step>

      <step order="5">
        <description>Create admin controller with authorization</description>
        <details>
          ```typescript
          // tax-tables.controller.ts
          import { Controller, Get, Post, Put, Body, Param, UseGuards, Request } from '@nestjs/common';
          import { AdminGuard } from '../auth/guards/admin.guard';
          import { AuditLog } from '../common/decorators/audit-log.decorator';

          @Controller('admin/tax-tables')
          @UseGuards(AdminGuard)
          export class TaxTablesController {
            constructor(private readonly taxTablesService: TaxTablesService) {}

            @Get()
            async getAllTaxYears() {
              return this.taxTablesService.getAllTaxYears();
            }

            @Get('current')
            async getCurrentTaxYear() {
              return this.taxTablesService.getCurrentTaxYear();
            }

            @Get(':id')
            async getTaxYear(@Param('id') id: string) {
              return this.taxTablesService.getTaxYearById(id);
            }

            @Post()
            @AuditLog('TAX_YEAR_CREATED')
            async createTaxYear(
              @Body() dto: CreateTaxYearDto,
              @Request() req: any
            ) {
              return this.taxTablesService.createTaxYear(dto, req.user.id);
            }

            @Put(':id')
            @AuditLog('TAX_YEAR_UPDATED')
            async updateTaxYear(
              @Param('id') id: string,
              @Body() dto: UpdateTaxYearDto,
              @Request() req: any
            ) {
              return this.taxTablesService.updateTaxYear(id, dto, req.user.id);
            }
          }
          ```
        </details>
      </step>

      <step order="6">
        <description>Update payroll calculator to use dynamic tax tables</description>
        <details>
          ```typescript
          // payroll-calculator.service.ts
          @Injectable()
          export class PayrollCalculatorService {
            constructor(private readonly taxTablesService: TaxTablesService) {}

            async calculatePAYE(
              annualTaxableIncome: number,
              employeeAge: number,
              payDate: Date
            ): Promise<number> {
              const taxYear = await this.taxTablesService.getTaxYearForDate(payDate);

              // Get applicable rebate based on age
              let rebate = taxYear.primaryRebate;
              if (employeeAge >= 75) {
                rebate += taxYear.tertiaryRebate;
              } else if (employeeAge >= 65) {
                rebate += taxYear.secondaryRebate;
              }

              // Get applicable threshold
              let threshold = taxYear.taxThreshold;
              if (employeeAge >= 75) {
                threshold = taxYear.taxThresholdOver75;
              } else if (employeeAge >= 65) {
                threshold = taxYear.taxThresholdOver65;
              }

              // Check if below threshold
              if (annualTaxableIncome <= threshold) {
                return 0;
              }

              // Find applicable bracket
              const bracket = taxYear.brackets.find(
                b => annualTaxableIncome >= b.lowerBound &&
                     (b.upperBound === null || annualTaxableIncome <= b.upperBound)
              );

              if (!bracket) {
                throw new Error(`No tax bracket found for income: ${annualTaxableIncome}`);
              }

              // Calculate tax
              const excessIncome = annualTaxableIncome - bracket.lowerBound;
              const marginalTax = excessIncome * (bracket.marginalRate / 100);
              const grossTax = bracket.baseTax + marginalTax;
              const netTax = Math.max(0, grossTax - rebate);

              return netTax;
            }
          }
          ```
        </details>
      </step>

      <step order="7">
        <description>Seed initial tax data for 2024/2025</description>
        <details>
          ```typescript
          // seeds/tax-year-2024-2025.seed.ts
          export const TAX_YEAR_2024_2025 = {
            yearCode: '2024/2025',
            effectiveFrom: new Date('2024-03-01'),
            effectiveTo: new Date('2025-02-28'),
            primaryRebate: 17235,
            secondaryRebate: 9444,
            tertiaryRebate: 3145,
            taxThreshold: 95750,
            taxThresholdOver65: 148217,
            taxThresholdOver75: 165689,
            medicalCreditsMain: 364,
            medicalCreditsFirstDependent: 364,
            medicalCreditsOtherDependents: 246,
            brackets: [
              { lowerBound: 0, upperBound: 237100, baseTax: 0, marginalRate: 18, bracketOrder: 1 },
              { lowerBound: 237100, upperBound: 370500, baseTax: 42678, marginalRate: 26, bracketOrder: 2 },
              { lowerBound: 370500, upperBound: 512800, baseTax: 77362, marginalRate: 31, bracketOrder: 3 },
              { lowerBound: 512800, upperBound: 673000, baseTax: 121475, marginalRate: 36, bracketOrder: 4 },
              { lowerBound: 673000, upperBound: 857900, baseTax: 179147, marginalRate: 39, bracketOrder: 5 },
              { lowerBound: 857900, upperBound: 1817000, baseTax: 251258, marginalRate: 41, bracketOrder: 6 },
              { lowerBound: 1817000, upperBound: null, baseTax: 644489, marginalRate: 45, bracketOrder: 7 }
            ]
          };
          ```
        </details>
      </step>
    </steps>
  </implementation>

  <verification>
    <test_requirements>
      <test type="unit">
        <description>Test tax calculation with various incomes</description>
        <file>apps/api/src/payroll/__tests__/payroll-calculator.service.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test tax year date range selection</description>
        <file>apps/api/src/payroll/__tests__/tax-tables.service.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test bracket validation logic</description>
        <file>apps/api/src/payroll/__tests__/tax-tables.service.spec.ts</file>
      </test>

      <test type="integration">
        <description>Test admin endpoints with authorization</description>
        <file>apps/api/src/payroll/__tests__/tax-tables.controller.spec.ts</file>
      </test>
    </test_requirements>

    <acceptance_criteria>
      <criterion>Tax brackets stored in database with effective dates</criterion>
      <criterion>Correct tax year automatically selected based on pay date</criterion>
      <criterion>Admin can create/update tax years via API</criterion>
      <criterion>Tax calculations use dynamic data instead of hardcoded values</criterion>
      <criterion>Cache improves performance for repeated calculations</criterion>
      <criterion>Audit trail exists for all tax table changes</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>Database entities created and migrated</item>
      <item>Tax tables service implemented with caching</item>
      <item>Admin API endpoints created with authorization</item>
      <item>Payroll calculator updated to use dynamic tables</item>
      <item>Initial 2024/2025 data seeded</item>
      <item>Bracket validation prevents invalid configurations</item>
      <item>Unit and integration tests passing</item>
      <item>Audit logging in place</item>
      <item>Code reviewed and approved</item>
    </checklist>
  </definition_of_done>

  <references>
    <reference type="official">SARS Tax Tables 2024/2025</reference>
    <reference type="legislation">Income Tax Act</reference>
    <reference type="documentation">https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/</reference>
  </references>
</task_specification>
