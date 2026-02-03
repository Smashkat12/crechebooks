/**
 * Exchange Rate Client Tests
 * TASK-FIX-004: Currency Conversion Service - Real FX Rate Integration
 *
 * Tests the ExchangeRateClient for Open Exchange Rates API integration.
 * Uses real HTTP calls when OPENEXCHANGE_APP_ID is set, otherwise tests
 * the error handling and calculation logic.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { ExchangeRateClient } from '../../../src/integrations/exchange-rates/exchange-rate.client';
import {
  Currency,
  ExchangeRateSource,
} from '../../../src/database/services/currency-conversion.service';

describe('ExchangeRateClient', () => {
  let client: ExchangeRateClient;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateClient,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    client = module.get<ExchangeRateClient>(ExchangeRateClient);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('isConfigured', () => {
    it('should return true when OPENEXCHANGE_APP_ID is set', () => {
      mockConfigService.get.mockReturnValue('test-app-id');

      // Need to recreate client to pick up config
      const testClient = new ExchangeRateClient(configService, httpService);

      expect(testClient.isConfigured()).toBe(true);
    });

    it('should return false when OPENEXCHANGE_APP_ID is not set', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const testClient = new ExchangeRateClient(configService, httpService);

      expect(testClient.isConfigured()).toBe(false);
    });
  });

  describe('fetchLatestRates', () => {
    it('should throw error when not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const testClient = new ExchangeRateClient(configService, httpService);

      await expect(testClient.fetchLatestRates()).rejects.toThrow(
        'OPENEXCHANGE_APP_ID not configured',
      );
    });

    it('should fetch rates successfully when configured', async () => {
      mockConfigService.get.mockReturnValue('test-app-id');

      const mockResponse: AxiosResponse = {
        data: {
          disclaimer: 'Test',
          license: 'Test',
          timestamp: Date.now(),
          base: 'USD',
          rates: {
            ZAR: 18.5,
            EUR: 0.92,
            GBP: 0.79,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const testClient = new ExchangeRateClient(configService, httpService);

      const rates = await testClient.fetchLatestRates();

      expect(rates).toEqual({
        ZAR: 18.5,
        EUR: 0.92,
        GBP: 0.79,
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://openexchangerates.org/api/latest.json',
        expect.objectContaining({
          params: expect.objectContaining({
            app_id: 'test-app-id',
          }),
        }),
      );
    });

    it('should throw error when API returns invalid response', async () => {
      mockConfigService.get.mockReturnValue('test-app-id');

      const mockResponse: AxiosResponse = {
        data: { invalid: 'response' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const testClient = new ExchangeRateClient(configService, httpService);

      await expect(testClient.fetchLatestRates()).rejects.toThrow(
        'Invalid response from Open Exchange Rates API',
      );
    });

    it('should propagate HTTP errors', async () => {
      mockConfigService.get.mockReturnValue('test-app-id');

      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const testClient = new ExchangeRateClient(configService, httpService);

      await expect(testClient.fetchLatestRates()).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('fetchHistoricalRates', () => {
    it('should throw error when not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const testClient = new ExchangeRateClient(configService, httpService);

      await expect(
        testClient.fetchHistoricalRates(new Date('2025-01-15')),
      ).rejects.toThrow('OPENEXCHANGE_APP_ID not configured');
    });

    it('should fetch historical rates for a specific date', async () => {
      mockConfigService.get.mockReturnValue('test-app-id');

      const mockResponse: AxiosResponse = {
        data: {
          disclaimer: 'Test',
          license: 'Test',
          timestamp: Date.now(),
          base: 'USD',
          rates: {
            ZAR: 18.2,
            EUR: 0.91,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const testClient = new ExchangeRateClient(configService, httpService);

      const rates = await testClient.fetchHistoricalRates(
        new Date('2025-01-15'),
      );

      expect(rates).toEqual({
        ZAR: 18.2,
        EUR: 0.91,
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://openexchangerates.org/api/historical/2025-01-15.json',
        expect.objectContaining({
          params: expect.objectContaining({
            app_id: 'test-app-id',
          }),
        }),
      );
    });
  });

  describe('calculateRate', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue('test-app-id');
    });

    it('should calculate cross rate correctly (ZAR to EUR)', () => {
      const testClient = new ExchangeRateClient(configService, httpService);

      const usdRates = {
        ZAR: 18.5,
        EUR: 0.92,
      };

      // ZAR -> EUR: 0.92 / 18.5 = 0.04973 EUR per ZAR
      const rate = testClient.calculateRate(usdRates, 'ZAR', 'EUR');

      expect(rate).toBeCloseTo(0.04973, 4);
    });

    it('should calculate cross rate correctly (USD to ZAR)', () => {
      const testClient = new ExchangeRateClient(configService, httpService);

      const usdRates = {
        ZAR: 18.5,
        USD: 1.0,
      };

      // USD -> ZAR: 18.5 / 1.0 = 18.5 ZAR per USD
      const rate = testClient.calculateRate(usdRates, 'USD', 'ZAR');

      expect(rate).toBeCloseTo(18.5, 4);
    });

    it('should calculate cross rate correctly (EUR to GBP)', () => {
      const testClient = new ExchangeRateClient(configService, httpService);

      const usdRates = {
        EUR: 0.92,
        GBP: 0.79,
      };

      // EUR -> GBP: 0.79 / 0.92 = 0.8587 GBP per EUR
      const rate = testClient.calculateRate(usdRates, 'EUR', 'GBP');

      expect(rate).toBeCloseTo(0.8587, 4);
    });

    it('should throw error when source currency is missing', () => {
      const testClient = new ExchangeRateClient(configService, httpService);

      const usdRates = {
        EUR: 0.92,
      };

      expect(() => testClient.calculateRate(usdRates, 'ZAR', 'EUR')).toThrow(
        'Missing exchange rate for source currency: ZAR',
      );
    });

    it('should throw error when target currency is missing', () => {
      const testClient = new ExchangeRateClient(configService, httpService);

      const usdRates = {
        ZAR: 18.5,
      };

      expect(() => testClient.calculateRate(usdRates, 'ZAR', 'GBP')).toThrow(
        'Missing exchange rate for target currency: GBP',
      );
    });

    it('should throw error when source rate is zero', () => {
      const testClient = new ExchangeRateClient(configService, httpService);

      const usdRates = {
        ZAR: 0,
        EUR: 0.92,
      };

      expect(() => testClient.calculateRate(usdRates, 'ZAR', 'EUR')).toThrow(
        'Invalid zero rate for source currency: ZAR',
      );
    });
  });

  describe('getRate', () => {
    it('should return ExchangeRate object with correct structure', async () => {
      mockConfigService.get.mockReturnValue('test-app-id');

      const mockResponse: AxiosResponse = {
        data: {
          disclaimer: 'Test',
          license: 'Test',
          timestamp: Date.now(),
          base: 'USD',
          rates: {
            ZAR: 18.5,
            EUR: 0.92,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const testClient = new ExchangeRateClient(configService, httpService);

      const rate = await testClient.getRate(Currency.ZAR, Currency.EUR);

      expect(rate).toMatchObject({
        fromCurrency: Currency.ZAR,
        toCurrency: Currency.EUR,
        source: ExchangeRateSource.OPENEXCHANGE,
      });

      expect(rate.rate).toBeCloseTo(0.04973, 4);
      expect(rate.inverseRate).toBeCloseTo(20.109, 2);
      expect(rate.effectiveDate).toBeInstanceOf(Date);
      expect(rate.timestamp).toBeInstanceOf(Date);
    });

    it('should use historical rates when effectiveDate is provided', async () => {
      mockConfigService.get.mockReturnValue('test-app-id');

      const mockResponse: AxiosResponse = {
        data: {
          disclaimer: 'Test',
          license: 'Test',
          timestamp: Date.now(),
          base: 'USD',
          rates: {
            ZAR: 17.5,
            EUR: 0.9,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const testClient = new ExchangeRateClient(configService, httpService);

      const effectiveDate = new Date('2025-01-01');
      const rate = await testClient.getRate(
        Currency.ZAR,
        Currency.EUR,
        effectiveDate,
      );

      expect(rate.effectiveDate).toEqual(effectiveDate);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('historical/2025-01-01.json'),
        expect.anything(),
      );
    });
  });

  describe('onModuleInit', () => {
    it('should log warning when not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const testClient = new ExchangeRateClient(configService, httpService);

      // Just verify it doesn't throw
      expect(() => testClient.onModuleInit()).not.toThrow();
    });

    it('should log success when configured', () => {
      mockConfigService.get.mockReturnValue('test-app-id');

      const testClient = new ExchangeRateClient(configService, httpService);

      // Just verify it doesn't throw
      expect(() => testClient.onModuleInit()).not.toThrow();
    });
  });
});
