/**
 * Exchange Rate Module
 * TASK-FIX-004: Currency Conversion Service - Real FX Rate Integration
 *
 * Provides the ExchangeRateClient for fetching real exchange rates
 * from Open Exchange Rates API.
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ExchangeRateClient } from './exchange-rate.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
    ConfigModule,
  ],
  providers: [ExchangeRateClient],
  exports: [ExchangeRateClient],
})
export class ExchangeRateModule {}
