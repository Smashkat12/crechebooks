/**
 * StorageModule
 * Gate-3: S3 file storage abstraction.
 *
 * Consumers import StorageModule and inject StorageService.
 * Do NOT register globally — import per feature module as needed.
 *
 * Depends on ConfigModule only (globally registered via ConfigModule.forRoot).
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import s3Config from './storage.config';

@Module({
  imports: [ConfigModule.forFeature(s3Config)],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
