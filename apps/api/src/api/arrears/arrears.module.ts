import { Module } from '@nestjs/common';
import { ArrearsController } from './arrears.controller';
import { DatabaseModule } from '../../database/database.module';
import { ArrearsReportPdfService } from '../../database/services/arrears-report-pdf.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ArrearsController],
  providers: [ArrearsReportPdfService],
})
export class ArrearsModule {}
