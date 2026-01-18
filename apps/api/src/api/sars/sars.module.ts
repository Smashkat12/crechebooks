/**
 * SARS Module
 * TASK-SARS-033: EMP201 Endpoint
 * TASK-SARS-035: Replace Mock eFiling with File Generation
 *
 * Provides the SarsController with required dependencies.
 */
import { Module } from '@nestjs/common';
import { SarsController } from './sars.controller';
import { SarsSubmissionRepository } from '../../database/repositories/sars-submission.repository';
import { Vat201Service } from '../../database/services/vat201.service';
import { VatService } from '../../database/services/vat.service';
import { VatAdjustmentService } from '../../database/services/vat-adjustment.service';
import { Emp201Service } from '../../database/services/emp201.service';
import { SarsFileGeneratorService } from '../../database/services/sars-file-generator.service';
import { PayeService } from '../../database/services/paye.service';
import { UifService } from '../../database/services/uif.service';
import { PrismaModule } from '../../database/prisma';
import { SimplePayModule } from '../../integrations/simplepay/simplepay.module';

@Module({
  imports: [PrismaModule, SimplePayModule],
  controllers: [SarsController],
  providers: [
    SarsSubmissionRepository,
    Vat201Service,
    VatService,
    VatAdjustmentService,
    Emp201Service,
    SarsFileGeneratorService,
    PayeService,
    UifService,
  ],
})
export class SarsApiModule {}
