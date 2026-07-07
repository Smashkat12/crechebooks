/**
 * OrchestratorAdminModule
 *
 * Wires OrchestratorAdminController into the app graph. The Orchestrator +
 * WorkflowRunRepository providers come from OrchestratorModule via forwardRef
 * to avoid the DatabaseModule <-> OrchestratorModule cycle (see the
 * DatabaseModule / OrchestratorModule cross-dependency already annotated in
 * database.module.ts).
 */

import { Module, forwardRef } from '@nestjs/common';
import { OrchestratorAdminController } from './orchestrator-admin.controller';
import { OrchestratorModule } from '../../../agents/orchestrator/orchestrator.module';

@Module({
  imports: [forwardRef(() => OrchestratorModule)],
  controllers: [OrchestratorAdminController],
})
export class OrchestratorAdminModule {}
