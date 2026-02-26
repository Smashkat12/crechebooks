/**
 * StubModule
 *
 * NestJS module for the Stub.africa accounting integration.
 * Provides the StubApiClient (HTTP layer) and StubAccountingAdapter
 * (AccountingProvider implementation).
 *
 * Import this module wherever Stub integration services are needed.
 * The AccountingModule wires StubAccountingAdapter to the
 * ACCOUNTING_PROVIDER token when `ACCOUNTING_PROVIDER=stub`.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { StubApiClient } from './stub-api.client';
import { StubAccountingAdapter } from './stub-accounting.adapter';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  providers: [StubApiClient, StubAccountingAdapter],
  exports: [StubApiClient, StubAccountingAdapter],
})
export class StubModule {}
