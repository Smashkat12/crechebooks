/**
 * Communications API Module
 * TASK-COMM-003: Communication API Controller
 *
 * NestJS module that provides REST API endpoints for ad-hoc communication.
 * Imports the CommunicationsModule for service and entity dependencies.
 */

import { Module } from '@nestjs/common';
import { CommunicationController } from './communication.controller';
import { CommunicationsModule } from '../../communications/communications.module';

@Module({
  imports: [CommunicationsModule],
  controllers: [CommunicationController],
})
export class CommunicationsApiModule {}
