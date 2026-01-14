/**
 * Extraction Validator Module
 * TASK-AGENT-006
 *
 * NestJS module for the extraction validation agent
 */
import { Module } from '@nestjs/common';
import { ExtractionValidatorAgent } from './validator.agent';
import { BalanceReconciler } from './balance-reconciler';
import { AmountSanityChecker } from './amount-sanity-checker';
import { ExtractionDecisionLogger } from './decision-logger';

@Module({
  providers: [
    ExtractionValidatorAgent,
    BalanceReconciler,
    AmountSanityChecker,
    ExtractionDecisionLogger,
  ],
  exports: [
    ExtractionValidatorAgent,
    BalanceReconciler,
    AmountSanityChecker,
  ],
})
export class ExtractionValidatorModule {}
