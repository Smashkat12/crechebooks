/**
 * MailgunInboundModule
 *
 * Receives forwarded FNB statement emails from Mailgun and pushes them
 * through TransactionImportService. Lives separately from MailgunModule
 * (which is outbound-only, @Global) to avoid polluting the global scope
 * with the import-service dependency.
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { MailgunInboundController } from './mailgun-inbound.controller';

@Module({
  imports: [
    ConfigModule,
    // forwardRef: DatabaseModule has a wide DI graph that already cycles
    // back through several integration modules. The lazy resolution avoids
    // the same pattern that bit AdminModule earlier today.
    forwardRef(() => DatabaseModule),
  ],
  controllers: [MailgunInboundController],
})
export class MailgunInboundModule {}
