import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { PayeePatternRepository } from '../../database/repositories/payee-pattern.repository';
import { TransactionImportService } from '../../database/services/transaction-import.service';
import { CategorizationService } from '../../database/services/categorization.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { PatternLearningService } from '../../database/services/pattern-learning.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [TransactionController],
  providers: [
    TransactionRepository,
    CategorizationRepository,
    PayeePatternRepository,
    TransactionImportService,
    CategorizationService,
    AuditLogService,
    PatternLearningService,
  ],
})
export class TransactionModule {}
