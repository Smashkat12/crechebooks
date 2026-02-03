<task_spec id="TASK-FIX-004" version="2.0">

<metadata>
  <title>Currency Conversion Service - Real FX Rate Integration</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>304</sequence>
  <implements>
    <requirement_ref>REQ-TXN-CURRENCY-001</requirement_ref>
    <requirement_ref>REQ-TXN-CURRENCY-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-TXN-004</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/api/src/database/services/currency-conversion.service.ts` (implement API integration)

  **Files to Create:**
  - `apps/api/src/integrations/exchange-rates/exchange-rate.client.ts` (NEW - API client)
  - `apps/api/src/integrations/exchange-rates/exchange-rate.module.ts` (NEW - module)
  - `apps/api/tests/database/services/currency-conversion.service.spec.ts` (update tests)

  **Current Problem:**
  The `fetchExternalRate()` method throws instead of fetching real rates:
  ```typescript
  private fetchExternalRate(
    fromCurrency: Currency,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): ExchangeRate {
    // For CMA currencies, use 1:1 rate
    if (
      this.isCommonMonetaryArea(fromCurrency) &&
      this.isCommonMonetaryArea(toCurrency)
    ) {
      return { ... }; // This works
    }

    // TODO: Implement actual SARB/OANDA API integration
    // For now, throw to trigger fallback
    throw new BusinessException(
      'External rate API not configured',
      'RATE_API_NOT_CONFIGURED',
    );
  }
  ```

  **Existing Infrastructure:**
  - Service has in-memory cache with 1-hour TTL
  - Default rates defined for common currencies
  - CMA (Common Monetary Area) currencies handled correctly
  - `ExchangeRateSource` enum includes SARB, OANDA, XE, OPENEXCHANGE

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Exchange Rate Client Pattern
  ```typescript
  // apps/api/src/integrations/exchange-rates/exchange-rate.client.ts
  import { Injectable, Logger } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { HttpService } from '@nestjs/axios';
  import { firstValueFrom } from 'rxjs';
  import {
    Currency,
    ExchangeRate,
    ExchangeRateSource,
  } from '../../database/services/currency-conversion.service';

  interface OpenExchangeRatesResponse {
    disclaimer: string;
    license: string;
    timestamp: number;
    base: string;
    rates: Record<string, number>;
  }

  @Injectable()
  export class ExchangeRateClient {
    private readonly logger = new Logger(ExchangeRateClient.name);
    private readonly baseUrl = 'https://openexchangerates.org/api';
    private readonly appId: string | undefined;

    constructor(
      private readonly configService: ConfigService,
      private readonly httpService: HttpService,
    ) {
      this.appId = this.configService.get<string>('OPENEXCHANGE_APP_ID');
    }

    /**
     * Check if the client is configured
     */
    isConfigured(): boolean {
      return !!this.appId;
    }

    /**
     * Fetch latest exchange rates from Open Exchange Rates API
     * Returns rates relative to USD as base
     */
    async fetchLatestRates(): Promise<Record<string, number>> {
      if (!this.appId) {
        throw new Error('OPENEXCHANGE_APP_ID not configured');
      }

      try {
        const response = await firstValueFrom(
          this.httpService.get<OpenExchangeRatesResponse>(
            `${this.baseUrl}/latest.json`,
            {
              params: {
                app_id: this.appId,
                symbols: 'ZAR,USD,EUR,GBP,BWP,NAD,SZL,LSL,MZN,ZMW,MWK',
              },
            },
          ),
        );

        return response.data.rates;
      } catch (error) {
        this.logger.error(
          `Failed to fetch exchange rates: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }

    /**
     * Fetch historical rates for a specific date
     */
    async fetchHistoricalRates(date: Date): Promise<Record<string, number>> {
      if (!this.appId) {
        throw new Error('OPENEXCHANGE_APP_ID not configured');
      }

      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

      try {
        const response = await firstValueFrom(
          this.httpService.get<OpenExchangeRatesResponse>(
            `${this.baseUrl}/historical/${dateStr}.json`,
            {
              params: {
                app_id: this.appId,
                symbols: 'ZAR,USD,EUR,GBP,BWP,NAD,SZL,LSL,MZN,ZMW,MWK',
              },
            },
          ),
        );

        return response.data.rates;
      } catch (error) {
        this.logger.error(
          `Failed to fetch historical rates for ${dateStr}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }

    /**
     * Convert USD-based rates to ZAR-based rate
     */
    calculateZarBasedRate(
      usdRates: Record<string, number>,
      fromCurrency: string,
      toCurrency: string,
    ): number {
      // Rates are relative to USD
      // To get FROM -> TO, we need: (1/FROM_USD) * TO_USD
      // Or equivalently: TO_USD / FROM_USD

      const fromRate = usdRates[fromCurrency];
      const toRate = usdRates[toCurrency];

      if (!fromRate || !toRate) {
        throw new Error(`Missing rate for ${fromCurrency} or ${toCurrency}`);
      }

      return toRate / fromRate;
    }

    /**
     * Get exchange rate between two currencies
     */
    async getRate(
      fromCurrency: Currency,
      toCurrency: Currency,
      effectiveDate?: Date,
    ): Promise<ExchangeRate> {
      const rates = effectiveDate
        ? await this.fetchHistoricalRates(effectiveDate)
        : await this.fetchLatestRates();

      const rate = this.calculateZarBasedRate(
        rates,
        fromCurrency,
        toCurrency,
      );

      return {
        fromCurrency,
        toCurrency,
        rate,
        inverseRate: 1 / rate,
        source: ExchangeRateSource.OPENEXCHANGE,
        effectiveDate: effectiveDate || new Date(),
        timestamp: new Date(),
      };
    }
  }
  ```

  ### 3. Updated Currency Conversion Service
  ```typescript
  // apps/api/src/database/services/currency-conversion.service.ts
  @Injectable()
  export class CurrencyConversionService {
    private readonly logger = new Logger(CurrencyConversionService.name);
    private readonly baseCurrency = Currency.ZAR;

    // In-memory cache for exchange rates
    private rateCache: Map<string, ExchangeRate> = new Map();
    private readonly cacheTtlMs = 60 * 60 * 1000; // 1 hour

    constructor(
      private readonly prisma: PrismaService,
      @Optional() private readonly exchangeRateClient?: ExchangeRateClient,
    ) {}

    // ... existing methods ...

    /**
     * Fetch exchange rate from external API
     */
    private async fetchExternalRate(
      fromCurrency: Currency,
      toCurrency: Currency,
      effectiveDate?: Date,
    ): Promise<ExchangeRate> {
      // For CMA currencies, use 1:1 rate
      if (
        this.isCommonMonetaryArea(fromCurrency) &&
        this.isCommonMonetaryArea(toCurrency)
      ) {
        return {
          fromCurrency,
          toCurrency,
          rate: 1.0,
          inverseRate: 1.0,
          source: ExchangeRateSource.SARB,
          effectiveDate: effectiveDate || new Date(),
          timestamp: new Date(),
        };
      }

      // Try external API if available
      if (this.exchangeRateClient?.isConfigured()) {
        try {
          return await this.exchangeRateClient.getRate(
            fromCurrency,
            toCurrency,
            effectiveDate,
          );
        } catch (error) {
          this.logger.warn(
            `External rate API failed, falling back to defaults: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // Fall through to use default rates
        }
      }

      // Fallback to default rates
      return this.calculateDefaultRate(fromCurrency, toCurrency, effectiveDate);
    }

    /**
     * Get exchange rate between two currencies
     * Now uses async to support API calls
     */
    async getExchangeRateAsync(
      fromCurrency: Currency,
      toCurrency: Currency,
      effectiveDate?: Date,
    ): Promise<ExchangeRate> {
      const dateKey = effectiveDate
        ? effectiveDate.toISOString().split('T')[0]
        : 'latest';
      const cacheKey = `${fromCurrency}_${toCurrency}_${dateKey}`;

      // Check cache
      const cached = this.rateCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTtlMs) {
        return cached;
      }

      // Fetch rate (from API or defaults)
      const rate = await this.fetchExternalRate(
        fromCurrency,
        toCurrency,
        effectiveDate,
      );

      // Cache the rate
      this.rateCache.set(cacheKey, rate);

      return rate;
    }

    /**
     * Convert currency with async API support
     */
    async convertCurrencyAsync(
      amountCents: number,
      fromCurrency: Currency,
      toCurrency: Currency,
      effectiveDate?: Date,
    ): Promise<ConvertedAmount> {
      if (fromCurrency === toCurrency) {
        return {
          originalCents: amountCents,
          originalCurrency: fromCurrency,
          convertedCents: amountCents,
          convertedCurrency: toCurrency,
          exchangeRate: 1.0,
          rateSource: ExchangeRateSource.MANUAL,
          rateTimestamp: new Date(),
          rateEffectiveDate: effectiveDate || new Date(),
        };
      }

      const rate = await this.getExchangeRateAsync(
        fromCurrency,
        toCurrency,
        effectiveDate,
      );

      const convertedCents = Math.round(amountCents * rate.rate);

      return {
        originalCents: amountCents,
        originalCurrency: fromCurrency,
        convertedCents,
        convertedCurrency: toCurrency,
        exchangeRate: rate.rate,
        rateSource: rate.source,
        rateTimestamp: rate.timestamp,
        rateEffectiveDate: rate.effectiveDate,
      };
    }
  }
  ```

  ### 4. Module Configuration
  ```typescript
  // apps/api/src/integrations/exchange-rates/exchange-rate.module.ts
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
  ```

  ### 5. Environment Variables
  ```bash
  # .env.example
  # Exchange Rate API (Open Exchange Rates - free tier available)
  OPENEXCHANGE_APP_ID=your_app_id_here
  ```

  ### 6. Test Pattern
  ```typescript
  describe('CurrencyConversionService - API Integration', () => {
    let service: CurrencyConversionService;
    let exchangeRateClient: ExchangeRateClient;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          CurrencyConversionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ExchangeRateClient, useValue: mockExchangeRateClient },
        ],
      }).compile();

      service = module.get(CurrencyConversionService);
      exchangeRateClient = module.get(ExchangeRateClient);
    });

    it('should fetch rate from API when configured', async () => {
      // Arrange
      mockExchangeRateClient.isConfigured.mockReturnValue(true);
      mockExchangeRateClient.getRate.mockResolvedValue({
        fromCurrency: Currency.USD,
        toCurrency: Currency.ZAR,
        rate: 18.5,
        inverseRate: 0.054,
        source: ExchangeRateSource.OPENEXCHANGE,
        effectiveDate: new Date(),
        timestamp: new Date(),
      });

      // Act
      const rate = await service.getExchangeRateAsync(Currency.USD, Currency.ZAR);

      // Assert
      expect(rate.rate).toBe(18.5);
      expect(rate.source).toBe(ExchangeRateSource.OPENEXCHANGE);
    });

    it('should fallback to defaults when API fails', async () => {
      // Arrange
      mockExchangeRateClient.isConfigured.mockReturnValue(true);
      mockExchangeRateClient.getRate.mockRejectedValue(new Error('API error'));

      // Act
      const rate = await service.getExchangeRateAsync(Currency.USD, Currency.ZAR);

      // Assert
      expect(rate.source).toBe(ExchangeRateSource.MANUAL);
      expect(rate.rate).toBeGreaterThan(0);
    });

    it('should use CMA 1:1 rates without API call', async () => {
      // Arrange
      mockExchangeRateClient.isConfigured.mockReturnValue(true);

      // Act
      const rate = await service.getExchangeRateAsync(Currency.ZAR, Currency.NAD);

      // Assert
      expect(rate.rate).toBe(1.0);
      expect(rate.source).toBe(ExchangeRateSource.SARB);
      expect(mockExchangeRateClient.getRate).not.toHaveBeenCalled();
    });

    it('should cache rates for 1 hour', async () => {
      // Arrange
      mockExchangeRateClient.isConfigured.mockReturnValue(true);
      mockExchangeRateClient.getRate.mockResolvedValue({
        fromCurrency: Currency.USD,
        toCurrency: Currency.ZAR,
        rate: 18.5,
        inverseRate: 0.054,
        source: ExchangeRateSource.OPENEXCHANGE,
        effectiveDate: new Date(),
        timestamp: new Date(),
      });

      // Act - call twice
      await service.getExchangeRateAsync(Currency.USD, Currency.ZAR);
      await service.getExchangeRateAsync(Currency.USD, Currency.ZAR);

      // Assert - API should only be called once
      expect(mockExchangeRateClient.getRate).toHaveBeenCalledTimes(1);
    });
  });
  ```

  ### 7. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task integrates a real exchange rate API for currency conversion.

**South African Context:**
- ZAR is the base currency for CrecheBooks
- Common Monetary Area (CMA) currencies (NAD, SZL, LSL) have 1:1 parity with ZAR
- SARB (South African Reserve Bank) publishes official rates
- Many businesses receive payments in USD, EUR, GBP from international sources

**API Options:**
1. **Open Exchange Rates** (recommended) - Free tier, 1000 requests/month
2. **OANDA** - More accurate but requires paid subscription
3. **XE** - Enterprise-grade, expensive
4. **SARB** - No public API, requires scraping

**Rate Caching Strategy:**
- Cache rates for 1 hour (sufficient for most business needs)
- Historical rates never expire in cache
- Fallback to default rates if API fails
</context>

<scope>
  <in_scope>
    - Create ExchangeRateClient for Open Exchange Rates API
    - Integrate client into CurrencyConversionService
    - Add async methods for API-based conversion
    - Implement graceful fallback to default rates
    - Cache API responses with TTL
    - Support historical rate lookups
  </in_scope>
  <out_of_scope>
    - Multiple API provider support (OANDA, XE)
    - Real-time rate streaming
    - Rate alerts or notifications
    - Admin UI for rate management
    - SARB official rate scraping
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create exchange rate client
# Create apps/api/src/integrations/exchange-rates/exchange-rate.client.ts

# 2. Create module
# Create apps/api/src/integrations/exchange-rates/exchange-rate.module.ts

# 3. Update currency conversion service
# Edit apps/api/src/database/services/currency-conversion.service.ts

# 4. Update database module to import ExchangeRateModule
# Edit apps/api/src/database/database.module.ts

# 5. Add environment variable to .env.example
# Edit apps/api/.env.example

# 6. Create/update tests
# Edit apps/api/tests/database/services/currency-conversion.service.spec.ts

# 7. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - API must be optional (service works without it)
    - CMA currencies must always use 1:1 rate
    - Rates must be cached for 1 hour
    - API failures must fall back to default rates
    - Historical dates must be supported
    - No secrets in code (use environment variables)
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Fetches rates from API when configured
    - Test: Falls back to defaults when API fails
    - Test: Uses CMA 1:1 rates without API call
    - Test: Caches rates to avoid excessive API calls
    - Test: Supports historical rate lookups
    - Test: Service works without API configured
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Hardcode API keys in code
  - Make API calls for CMA currencies
  - Throw exceptions when API fails (use fallback)
  - Skip caching (rate limits are real)
  - Block startup if API is unavailable
  - Use synchronous HTTP calls
</anti_patterns>

</task_spec>
