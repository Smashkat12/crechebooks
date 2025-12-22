/**
 * SARS Module
 * TASK-SARS-033: EMP201 Endpoint
 *
 * Provides the SarsController with required dependencies.
 */
import { Module } from '@nestjs/common';
import { SarsController } from './sars.controller';
import { SarsSubmissionRepository } from '../../database/repositories/sars-submission.repository';
import { Vat201Service } from '../../database/services/vat201.service';
import { VatService } from '../../database/services/vat.service';
import { Emp201Service } from '../../database/services/emp201.service';
import { PayeService } from '../../database/services/paye.service';
import { UifService } from '../../database/services/uif.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [SarsController],
  providers: [
    SarsSubmissionRepository,
    Vat201Service,
    VatService,
    Emp201Service,
    PayeService,
    UifService,
  ],
})
export class SarsModule {}
