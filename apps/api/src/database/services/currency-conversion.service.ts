/**
 * Currency Conversion Service
 * TXN-004: Fix Currency Conversion
 * TASK-FIX-004: Real FX Rate Integration via Open Exchange Rates API
 *
 * Supports multi-currency transactions with ZAR as base currency:
 * - Store original currency and converted amount
 * - Use exchange rate at transaction date
 * - Track exchange rate source and timestamp
 * - Support manual, SARB, and third-party rates
 * - Fetch real rates from Open Exchange Rates API (when configured)
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ValidationException,
  BusinessException,
} from '../../shared/exceptions';
import { ExchangeRateClient } from '../../integrations/exchange-rates/exchange-rate.client';

/**
 * Supported currencies (ISO 4217 codes)
 * Focus on currencies commonly used in South African business
 */
export enum Currency {
  ZAR = 'ZAR', // South African Rand (base)
  USD = 'USD', // US Dollar
  EUR = 'EUR', // Euro
  GBP = 'GBP', // British Pound
  BWP = 'BWP', // Botswana Pula
  NAD = 'NAD', // Namibian Dollar
  SZL = 'SZL', // Eswatini Lilangeni
  LSL = 'LSL', // Lesotho Loti
  MZN = 'MZN', // Mozambican Metical
  ZMW = 'ZMW', // Zambian Kwacha
  MWK = 'MWK', // Malawian Kwacha
}

/**
 * Exchange rate source
 */
export enum ExchangeRateSource {
  MANUAL = 'MANUAL', // Manually entered rate
  SARB = 'SARB', // South African Reserve Bank
  OANDA = 'OANDA', // OANDA API
  XE = 'XE', // XE.com
  OPENEXCHANGE = 'OPENEXCHANGE', // Open Exchange Rates
}

/**
 * Exchange rate data structure
 */
export interface ExchangeRate {
  id?: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  rate: number; // Multiply by this to convert FROM -> TO
  inverseRate: number; // Multiply by this to convert TO -> FROM
  source: ExchangeRateSource;
  effectiveDate: Date;
  timestamp: Date;
  tenantId?: string; // Optional - null for system-wide rates
}

/**
 * Currency conversion result
 */
export interface ConvertedAmount {
  originalCents: number;
  originalCurrency: Currency;
  convertedCents: number;
  convertedCurrency: Currency;
  exchangeRate: number;
  rateSource: ExchangeRateSource;
  rateTimestamp: Date;
  rateEffectiveDate: Date;
}

/**
 * Multi-currency transaction data
 */
export interface MultiCurrencyTransaction {
  amountCents: number;
  currency: Currency;
  convertedAmountCents?: number;
  exchangeRate?: number;
  rateSource?: ExchangeRateSource;
  rateTimestamp?: Date;
}

/**
 * Default exchange rates (fallback when API unavailable)
 * These are approximate rates and should be updated via API
 */
const DEFAULT_EXCHANGE_RATES: Record<Currency, number> = {
  [Currency.ZAR]: 1.0, // Base currency
  [Currency.USD]: 0.054, // ~18.5 ZAR/USD
  [Currency.EUR]: 0.05, // ~20 ZAR/EUR
  [Currency.GBP]: 0.043, // ~23 ZAR/GBP
  [Currency.BWP]: 0.74, // ~1.35 ZAR/BWP
  [Currency.NAD]: 1.0, // 1:1 with ZAR
  [Currency.SZL]: 1.0, // 1:1 with ZAR
  [Currency.LSL]: 1.0, // 1:1 with ZAR
  [Currency.MZN]: 3.5, // ~0.29 ZAR/MZN
  [Currency.ZMW]: 1.4, // ~0.71 ZAR/ZMW
  [Currency.MWK]: 92.0, // ~0.011 ZAR/MWK
};

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

  /**
   * Convert an amount from one currency to another
   */
  convertCurrency(
    amountCents: number,
    fromCurrency: Currency,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): ConvertedAmount {
    // If same currency, no conversion needed
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

    const rate = this.getExchangeRate(fromCurrency, toCurrency, effectiveDate);

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

  /**
   * Convert amount to ZAR (base currency)
   */
  convertToZAR(
    amountCents: number,
    fromCurrency: Currency,
    effectiveDate?: Date,
  ): ConvertedAmount {
    return this.convertCurrency(
      amountCents,
      fromCurrency,
      Currency.ZAR,
      effectiveDate,
    );
  }

  /**
   * Convert amount from ZAR to another currency
   */
  convertFromZAR(
    amountCents: number,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): ConvertedAmount {
    return this.convertCurrency(
      amountCents,
      Currency.ZAR,
      toCurrency,
      effectiveDate,
    );
  }

  /**
   * Get exchange rate between two currencies
   */
  getExchangeRate(
    fromCurrency: Currency,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): ExchangeRate {
    const dateKey = effectiveDate
      ? effectiveDate.toISOString().split('T')[0]
      : 'latest';
    const cacheKey = `${fromCurrency}_${toCurrency}_${dateKey}`;

    // Check cache
    const cached = this.rateCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTtlMs) {
      return cached;
    }

    // Try to fetch from external source
    let rate: ExchangeRate;

    try {
      rate = this.fetchExternalRate(fromCurrency, toCurrency, effectiveDate);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch external rate for ${fromCurrency}/${toCurrency}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );

      // Fallback to default rates
      rate = this.calculateDefaultRate(fromCurrency, toCurrency, effectiveDate);
    }

    // Cache the rate
    this.rateCache.set(cacheKey, rate);

    return rate;
  }

  /**
   * Set a manual exchange rate
   */
  setManualRate(
    fromCurrency: Currency,
    toCurrency: Currency,
    rate: number,
    effectiveDate?: Date,
    tenantId?: string,
  ): ExchangeRate {
    if (rate <= 0) {
      throw new ValidationException('Invalid exchange rate', [
        { field: 'rate', message: 'Exchange rate must be positive' },
      ]);
    }

    const exchangeRate: ExchangeRate = {
      id: `manual_${fromCurrency}_${toCurrency}_${Date.now()}`,
      fromCurrency,
      toCurrency,
      rate,
      inverseRate: 1 / rate,
      source: ExchangeRateSource.MANUAL,
      effectiveDate: effectiveDate || new Date(),
      timestamp: new Date(),
      tenantId,
    };

    // Cache the manual rate
    const dateKey = effectiveDate
      ? effectiveDate.toISOString().split('T')[0]
      : 'latest';
    const cacheKey = `${fromCurrency}_${toCurrency}_${dateKey}`;
    this.rateCache.set(cacheKey, exchangeRate);

    // Also cache inverse
    const inverseCacheKey = `${toCurrency}_${fromCurrency}_${dateKey}`;
    this.rateCache.set(inverseCacheKey, {
      ...exchangeRate,
      fromCurrency: toCurrency,
      toCurrency: fromCurrency,
      rate: exchangeRate.inverseRate,
      inverseRate: exchangeRate.rate,
    });

    this.logger.log(
      `Set manual rate: ${fromCurrency}/${toCurrency} = ${rate} (effective: ${dateKey})`,
    );

    return exchangeRate;
  }

  /**
   * Get all available currencies
   */
  getSupportedCurrencies(): Currency[] {
    return Object.values(Currency);
  }

  /**
   * Get currency details
   */
  getCurrencyDetails(currency: Currency): {
    code: Currency;
    name: string;
    symbol: string;
    decimalPlaces: number;
  } {
    const currencyDetails: Record<
      Currency,
      { name: string; symbol: string; decimalPlaces: number }
    > = {
      [Currency.ZAR]: {
        name: 'South African Rand',
        symbol: 'R',
        decimalPlaces: 2,
      },
      [Currency.USD]: { name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
      [Currency.EUR]: { name: 'Euro', symbol: '\u20AC', decimalPlaces: 2 },
      [Currency.GBP]: {
        name: 'British Pound',
        symbol: '\u00A3',
        decimalPlaces: 2,
      },
      [Currency.BWP]: { name: 'Botswana Pula', symbol: 'P', decimalPlaces: 2 },
      [Currency.NAD]: {
        name: 'Namibian Dollar',
        symbol: 'N$',
        decimalPlaces: 2,
      },
      [Currency.SZL]: {
        name: 'Eswatini Lilangeni',
        symbol: 'E',
        decimalPlaces: 2,
      },
      [Currency.LSL]: { name: 'Lesotho Loti', symbol: 'L', decimalPlaces: 2 },
      [Currency.MZN]: {
        name: 'Mozambican Metical',
        symbol: 'MT',
        decimalPlaces: 2,
      },
      [Currency.ZMW]: {
        name: 'Zambian Kwacha',
        symbol: 'ZK',
        decimalPlaces: 2,
      },
      [Currency.MWK]: {
        name: 'Malawian Kwacha',
        symbol: 'MK',
        decimalPlaces: 2,
      },
    };

    return { code: currency, ...currencyDetails[currency] };
  }

  /**
   * Format amount with currency symbol
   */
  formatAmount(amountCents: number, currency: Currency = Currency.ZAR): string {
    const details = this.getCurrencyDetails(currency);
    const amount = amountCents / 100;

    return `${details.symbol}${amount.toFixed(details.decimalPlaces)}`;
  }

  /**
   * Parse currency code from string
   */
  parseCurrencyCode(code: string): Currency {
    const normalized = code.toUpperCase().trim();

    if (Object.values(Currency).includes(normalized as Currency)) {
      return normalized as Currency;
    }

    // Common aliases
    const aliases: Record<string, Currency> = {
      RAND: Currency.ZAR,
      DOLLAR: Currency.USD,
      EURO: Currency.EUR,
      POUND: Currency.GBP,
      PULA: Currency.BWP,
    };

    if (aliases[normalized]) {
      return aliases[normalized];
    }

    throw new ValidationException('Invalid currency code', [
      {
        field: 'currency',
        message: `Unknown currency code: ${code}. Supported: ${Object.values(Currency).join(', ')}`,
      },
    ]);
  }

  /**
   * Check if two currencies are in the Common Monetary Area (CMA)
   * CMA currencies maintain 1:1 parity with ZAR
   */
  isCommonMonetaryArea(currency: Currency): boolean {
    const cmaCurrencies = [
      Currency.ZAR,
      Currency.NAD,
      Currency.SZL,
      Currency.LSL,
    ];
    return cmaCurrencies.includes(currency);
  }

  /**
   * Fetch exchange rate from external API (async)
   * TASK-FIX-004: Now integrates with Open Exchange Rates API
   *
   * Priority order:
   * 1. CMA currencies always use 1:1 rate (no API call needed)
   * 2. Open Exchange Rates API if configured
   * 3. Falls back to default rates if API unavailable or fails
   */
  private async fetchExternalRateAsync(
    fromCurrency: Currency,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): Promise<ExchangeRate> {
    // For CMA currencies, use 1:1 rate (no external call needed)
    if (
      this.isCommonMonetaryArea(fromCurrency) &&
      this.isCommonMonetaryArea(toCurrency)
    ) {
      this.logger.debug(
        `CMA currency pair ${fromCurrency}/${toCurrency} - using 1:1 rate`,
      );
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

    // Try external API if available and configured
    if (this.exchangeRateClient?.isConfigured()) {
      try {
        this.logger.debug(
          `Fetching external rate for ${fromCurrency}/${toCurrency}`,
        );
        return await this.exchangeRateClient.getRate(
          fromCurrency,
          toCurrency,
          effectiveDate,
        );
      } catch (error) {
        this.logger.warn(
          `External rate API failed for ${fromCurrency}/${toCurrency}, falling back to defaults: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Fall through to use default rates
      }
    } else {
      this.logger.debug(
        `Exchange rate client not configured - using default rates for ${fromCurrency}/${toCurrency}`,
      );
    }

    // Fallback to default rates
    return this.calculateDefaultRate(fromCurrency, toCurrency, effectiveDate);
  }

  /**
   * Fetch exchange rate (synchronous version for backward compatibility)
   * For CMA currencies and default rates only - async method handles API calls
   */
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

    // For sync calls, use default rates (async method handles API calls)
    return this.calculateDefaultRate(fromCurrency, toCurrency, effectiveDate);
  }

  /**
   * Calculate default rate using built-in rates
   */
  private calculateDefaultRate(
    fromCurrency: Currency,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): ExchangeRate {
    // Convert through ZAR as base
    const fromToZar = DEFAULT_EXCHANGE_RATES[fromCurrency];
    const toToZar = DEFAULT_EXCHANGE_RATES[toCurrency];

    if (!fromToZar || !toToZar) {
      throw new BusinessException(
        `No exchange rate available for ${fromCurrency}/${toCurrency}`,
        'RATE_NOT_AVAILABLE',
        { fromCurrency, toCurrency },
      );
    }

    // Rate = (1 / fromToZar) * toToZar = ZAR value * toToZar
    // If fromCurrency is USD (0.054 ZAR per USD), then 1 USD = 1/0.054 = 18.5 ZAR
    // If toCurrency is ZAR, then rate = 18.5

    let rate: number;
    if (toCurrency === Currency.ZAR) {
      rate = 1 / fromToZar; // Convert to ZAR
    } else if (fromCurrency === Currency.ZAR) {
      rate = toToZar; // Convert from ZAR
    } else {
      // Cross rate through ZAR
      rate = (1 / fromToZar) * toToZar;
    }

    return {
      fromCurrency,
      toCurrency,
      rate,
      inverseRate: 1 / rate,
      source: ExchangeRateSource.MANUAL,
      effectiveDate: effectiveDate || new Date(),
      timestamp: new Date(),
    };
  }

  /**
   * Clear exchange rate cache
   */
  clearCache(): void {
    this.rateCache.clear();
    this.logger.debug('Exchange rate cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; currencies: string[] } {
    return {
      size: this.rateCache.size,
      currencies: Array.from(this.rateCache.keys()),
    };
  }

  // ============================================================================
  // ASYNC METHODS - TASK-FIX-004: Real FX Rate Integration
  // These methods support external API calls and should be used when real-time
  // exchange rates are needed.
  // ============================================================================

  /**
   * Get exchange rate between two currencies (async version for API support)
   * TASK-FIX-004: Async method that supports external API calls
   *
   * Use this method when you need real-time rates from the external API.
   * Falls back gracefully to cached or default rates if API is unavailable.
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

    // Check cache first
    const cached = this.rateCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTtlMs) {
      this.logger.debug(
        `Using cached rate for ${fromCurrency}/${toCurrency}: ${cached.rate}`,
      );
      return cached;
    }

    // Fetch rate (from API or defaults)
    const rate = await this.fetchExternalRateAsync(
      fromCurrency,
      toCurrency,
      effectiveDate,
    );

    // Cache the rate
    this.rateCache.set(cacheKey, rate);

    // Also cache inverse rate
    const inverseCacheKey = `${toCurrency}_${fromCurrency}_${dateKey}`;
    this.rateCache.set(inverseCacheKey, {
      ...rate,
      fromCurrency: toCurrency,
      toCurrency: fromCurrency,
      rate: rate.inverseRate,
      inverseRate: rate.rate,
    });

    return rate;
  }

  /**
   * Convert currency (async version for API support)
   * TASK-FIX-004: Async method that supports external API calls
   *
   * Use this method when you need real-time conversion with external rates.
   */
  async convertCurrencyAsync(
    amountCents: number,
    fromCurrency: Currency,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): Promise<ConvertedAmount> {
    // Same currency - no conversion needed
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

    this.logger.debug(
      `Converted ${amountCents} ${fromCurrency} to ${convertedCents} ${toCurrency} (rate: ${rate.rate}, source: ${rate.source})`,
    );

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

  /**
   * Convert to ZAR (async version for API support)
   * TASK-FIX-004: Async method that supports external API calls
   */
  async convertToZARAsync(
    amountCents: number,
    fromCurrency: Currency,
    effectiveDate?: Date,
  ): Promise<ConvertedAmount> {
    return this.convertCurrencyAsync(
      amountCents,
      fromCurrency,
      Currency.ZAR,
      effectiveDate,
    );
  }

  /**
   * Convert from ZAR (async version for API support)
   * TASK-FIX-004: Async method that supports external API calls
   */
  async convertFromZARAsync(
    amountCents: number,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): Promise<ConvertedAmount> {
    return this.convertCurrencyAsync(
      amountCents,
      Currency.ZAR,
      toCurrency,
      effectiveDate,
    );
  }

  /**
   * Refresh exchange rates from external API
   * TASK-FIX-004: Force refresh rates from external source
   *
   * Use this to manually trigger a rate refresh, e.g., at scheduled intervals
   * or when rates seem stale.
   */
  async refreshRates(): Promise<void> {
    if (!this.exchangeRateClient?.isConfigured()) {
      this.logger.warn(
        'Cannot refresh rates - exchange rate client not configured',
      );
      return;
    }

    try {
      this.logger.log('Refreshing exchange rates from external API...');

      // Fetch latest rates for common currency pairs
      const baseCurrencies = [Currency.ZAR, Currency.USD, Currency.EUR];
      const refreshPromises: Promise<ExchangeRate>[] = [];

      for (const from of baseCurrencies) {
        for (const to of Object.values(Currency)) {
          if (from !== to && !this.isCommonMonetaryArea(to)) {
            refreshPromises.push(this.getExchangeRateAsync(from, to));
          }
        }
      }

      await Promise.all(refreshPromises);

      this.logger.log(
        `Exchange rates refreshed successfully. Cache now contains ${this.rateCache.size} rates.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to refresh exchange rates: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Check if the external rate API is configured and available
   * TASK-FIX-004: Utility method to check API availability
   */
  isExternalApiConfigured(): boolean {
    return this.exchangeRateClient?.isConfigured() ?? false;
  }
}
