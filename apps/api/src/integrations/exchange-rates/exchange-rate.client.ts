/**
 * Exchange Rate Client
 * TASK-FIX-004: Currency Conversion Service - Real FX Rate Integration
 *
 * Uses Open Exchange Rates API for fetching real-time and historical exchange rates.
 * Free tier: 1000 requests/month with hourly updates.
 *
 * API Documentation: https://docs.openexchangerates.org/
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  Currency,
  ExchangeRate,
  ExchangeRateSource,
} from '../../database/services/currency-conversion.service';

/**
 * Open Exchange Rates API response structure
 */
interface OpenExchangeRatesResponse {
  disclaimer: string;
  license: string;
  timestamp: number;
  base: string;
  rates: Record<string, number>;
}

/**
 * Supported currency symbols for API requests
 * Limited to currencies relevant to South African business
 */
const SUPPORTED_SYMBOLS = [
  'ZAR', // South African Rand
  'USD', // US Dollar
  'EUR', // Euro
  'GBP', // British Pound
  'BWP', // Botswana Pula
  'NAD', // Namibian Dollar
  'SZL', // Eswatini Lilangeni
  'LSL', // Lesotho Loti
  'MZN', // Mozambican Metical
  'ZMW', // Zambian Kwacha
  'MWK', // Malawian Kwacha
].join(',');

@Injectable()
export class ExchangeRateClient implements OnModuleInit {
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
   * Log configuration status on module initialization
   */
  onModuleInit(): void {
    if (this.appId) {
      this.logger.log(
        'Exchange Rate Client configured with Open Exchange Rates API',
      );
    } else {
      this.logger.warn(
        'OPENEXCHANGE_APP_ID not set - external rate fetching disabled, will use default rates',
      );
    }
  }

  /**
   * Check if the client is configured with API credentials
   */
  isConfigured(): boolean {
    return !!this.appId;
  }

  /**
   * Fetch latest exchange rates from Open Exchange Rates API
   * Returns rates relative to USD as base (free tier limitation)
   *
   * @throws Error if API call fails or client is not configured
   */
  async fetchLatestRates(): Promise<Record<string, number>> {
    if (!this.appId) {
      const error = new Error(
        'OPENEXCHANGE_APP_ID not configured - cannot fetch external rates',
      );
      this.logger.error(error.message);
      throw error;
    }

    try {
      this.logger.debug(
        'Fetching latest exchange rates from Open Exchange Rates API',
      );

      const response = await firstValueFrom(
        this.httpService.get<OpenExchangeRatesResponse>(
          `${this.baseUrl}/latest.json`,
          {
            params: {
              app_id: this.appId,
              symbols: SUPPORTED_SYMBOLS,
            },
            timeout: 10000,
          },
        ),
      );

      if (!response.data || !response.data.rates) {
        const error = new Error(
          'Invalid response from Open Exchange Rates API - missing rates data',
        );
        this.logger.error(error.message, { response: response.data });
        throw error;
      }

      this.logger.debug(
        `Fetched ${Object.keys(response.data.rates).length} exchange rates (base: ${response.data.base})`,
      );

      return response.data.rates;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Failed to fetch latest exchange rates: ${message}`, {
        error,
      });
      throw error;
    }
  }

  /**
   * Fetch historical rates for a specific date
   * Note: Historical data requires paid plan on Open Exchange Rates
   *
   * @param date - The date for which to fetch rates
   * @throws Error if API call fails or client is not configured
   */
  async fetchHistoricalRates(date: Date): Promise<Record<string, number>> {
    if (!this.appId) {
      const error = new Error(
        'OPENEXCHANGE_APP_ID not configured - cannot fetch external rates',
      );
      this.logger.error(error.message);
      throw error;
    }

    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format

    try {
      this.logger.debug(
        `Fetching historical exchange rates for ${dateStr} from Open Exchange Rates API`,
      );

      const response = await firstValueFrom(
        this.httpService.get<OpenExchangeRatesResponse>(
          `${this.baseUrl}/historical/${dateStr}.json`,
          {
            params: {
              app_id: this.appId,
              symbols: SUPPORTED_SYMBOLS,
            },
            timeout: 10000,
          },
        ),
      );

      if (!response.data || !response.data.rates) {
        const error = new Error(
          `Invalid response from Open Exchange Rates API for ${dateStr} - missing rates data`,
        );
        this.logger.error(error.message, { response: response.data });
        throw error;
      }

      this.logger.debug(
        `Fetched ${Object.keys(response.data.rates).length} historical rates for ${dateStr}`,
      );

      return response.data.rates;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(
        `Failed to fetch historical rates for ${dateStr}: ${message}`,
        { error },
      );
      throw error;
    }
  }

  /**
   * Convert USD-based rates to a direct rate between two currencies
   * Rates from Open Exchange Rates are relative to USD
   *
   * Formula: FROM -> TO = TO_rate / FROM_rate
   * Example: ZAR -> EUR with rates {ZAR: 18.5, EUR: 0.92}
   *          = 0.92 / 18.5 = 0.0497 EUR per ZAR
   *
   * @param usdRates - Rates relative to USD (1 USD = X currency)
   * @param fromCurrency - Source currency code
   * @param toCurrency - Target currency code
   * @returns The exchange rate to convert FROM -> TO
   * @throws Error if either currency rate is missing
   */
  calculateRate(
    usdRates: Record<string, number>,
    fromCurrency: string,
    toCurrency: string,
  ): number {
    const fromRate = usdRates[fromCurrency];
    const toRate = usdRates[toCurrency];

    if (fromRate === undefined || fromRate === null) {
      const error = new Error(
        `Missing exchange rate for source currency: ${fromCurrency}`,
      );
      this.logger.error(error.message, {
        availableRates: Object.keys(usdRates),
      });
      throw error;
    }

    if (toRate === undefined || toRate === null) {
      const error = new Error(
        `Missing exchange rate for target currency: ${toCurrency}`,
      );
      this.logger.error(error.message, {
        availableRates: Object.keys(usdRates),
      });
      throw error;
    }

    if (fromRate === 0) {
      const error = new Error(
        `Invalid zero rate for source currency: ${fromCurrency}`,
      );
      this.logger.error(error.message);
      throw error;
    }

    // Cross rate calculation: TO / FROM
    const rate = toRate / fromRate;

    this.logger.debug(
      `Calculated rate ${fromCurrency} -> ${toCurrency}: ${rate} (from USD rates: ${fromCurrency}=${fromRate}, ${toCurrency}=${toRate})`,
    );

    return rate;
  }

  /**
   * Get exchange rate between two currencies
   *
   * @param fromCurrency - Source currency
   * @param toCurrency - Target currency
   * @param effectiveDate - Optional date for historical rates (defaults to current)
   * @returns ExchangeRate object with rate details
   * @throws Error if API call fails or rates are unavailable
   */
  async getRate(
    fromCurrency: Currency,
    toCurrency: Currency,
    effectiveDate?: Date,
  ): Promise<ExchangeRate> {
    // Fetch rates (latest or historical)
    const rates = effectiveDate
      ? await this.fetchHistoricalRates(effectiveDate)
      : await this.fetchLatestRates();

    // Calculate the cross rate
    const rate = this.calculateRate(rates, fromCurrency, toCurrency);

    const exchangeRate: ExchangeRate = {
      fromCurrency,
      toCurrency,
      rate,
      inverseRate: 1 / rate,
      source: ExchangeRateSource.OPENEXCHANGE,
      effectiveDate: effectiveDate || new Date(),
      timestamp: new Date(),
    };

    this.logger.log(
      `Retrieved exchange rate: ${fromCurrency}/${toCurrency} = ${rate.toFixed(6)} (source: OpenExchange)`,
    );

    return exchangeRate;
  }
}
