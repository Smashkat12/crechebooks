/**
 * Currency Conversion Service Tests
 * TXN-004: Fix Currency Conversion
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  CurrencyConversionService,
  Currency,
  ExchangeRateSource,
} from '../../../src/database/services/currency-conversion.service';
import { ValidationException } from '../../../src/shared/exceptions';

describe('CurrencyConversionService', () => {
  let service: CurrencyConversionService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, CurrencyConversionService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<CurrencyConversionService>(CurrencyConversionService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    service.clearCache();
  });

  describe('convertCurrency', () => {
    it('should return same amount when currencies match', async () => {
      const result = await service.convertCurrency(
        10000, // R100.00
        Currency.ZAR,
        Currency.ZAR,
      );

      expect(result.originalCents).toBe(10000);
      expect(result.convertedCents).toBe(10000);
      expect(result.exchangeRate).toBe(1.0);
    });

    it('should convert USD to ZAR', async () => {
      const result = await service.convertCurrency(
        10000, // $100.00
        Currency.USD,
        Currency.ZAR,
      );

      expect(result.originalCents).toBe(10000);
      expect(result.originalCurrency).toBe(Currency.USD);
      expect(result.convertedCurrency).toBe(Currency.ZAR);
      expect(result.convertedCents).toBeGreaterThan(0);
      expect(result.exchangeRate).toBeGreaterThan(1); // USD > ZAR
    });

    it('should convert ZAR to EUR', async () => {
      const result = await service.convertCurrency(
        100000, // R1000.00
        Currency.ZAR,
        Currency.EUR,
      );

      expect(result.originalCents).toBe(100000);
      expect(result.originalCurrency).toBe(Currency.ZAR);
      expect(result.convertedCurrency).toBe(Currency.EUR);
      expect(result.convertedCents).toBeLessThan(100000); // EUR > ZAR
    });

    it('should handle CMA currencies at 1:1', async () => {
      const result = await service.convertCurrency(
        50000, // R500.00
        Currency.ZAR,
        Currency.NAD, // Namibian Dollar
      );

      expect(result.convertedCents).toBe(50000);
      expect(result.exchangeRate).toBe(1.0);
    });

    it('should use effective date for rate lookup', async () => {
      const pastDate = new Date('2024-01-15');
      const result = await service.convertCurrency(
        10000,
        Currency.USD,
        Currency.ZAR,
        pastDate,
      );

      expect(result.rateEffectiveDate.toDateString()).toBe(
        pastDate.toDateString(),
      );
    });
  });

  describe('convertToZAR', () => {
    it('should convert foreign currency to ZAR', async () => {
      const result = await service.convertToZAR(10000, Currency.GBP);

      expect(result.originalCurrency).toBe(Currency.GBP);
      expect(result.convertedCurrency).toBe(Currency.ZAR);
      expect(result.convertedCents).toBeGreaterThan(10000); // GBP > ZAR
    });

    it('should handle ZAR input', async () => {
      const result = await service.convertToZAR(10000, Currency.ZAR);

      expect(result.convertedCents).toBe(10000);
    });
  });

  describe('convertFromZAR', () => {
    it('should convert ZAR to foreign currency', async () => {
      const result = await service.convertFromZAR(100000, Currency.USD);

      expect(result.originalCurrency).toBe(Currency.ZAR);
      expect(result.convertedCurrency).toBe(Currency.USD);
      expect(result.convertedCents).toBeLessThan(100000); // USD > ZAR
    });
  });

  describe('setManualRate', () => {
    it('should set and use manual exchange rate', async () => {
      service.setManualRate(
        Currency.USD,
        Currency.ZAR,
        18.5, // 1 USD = 18.5 ZAR
      );

      const rate = service.getExchangeRate(Currency.USD, Currency.ZAR);

      expect(rate.rate).toBe(18.5);
      expect(rate.source).toBe(ExchangeRateSource.MANUAL);
    });

    it('should reject zero or negative rates', async () => {
      await expect(
        service.setManualRate(Currency.USD, Currency.ZAR, 0),
      ).rejects.toThrow(ValidationException);

      await expect(
        service.setManualRate(Currency.USD, Currency.ZAR, -1),
      ).rejects.toThrow(ValidationException);
    });

    it('should cache inverse rate', async () => {
      service.setManualRate(Currency.USD, Currency.ZAR, 18.5);

      const inverseRate = service.getExchangeRate(Currency.ZAR, Currency.USD);

      expect(inverseRate.rate).toBeCloseTo(1 / 18.5, 4);
    });
  });

  describe('getExchangeRate', () => {
    it('should return rate between two currencies', async () => {
      const rate = service.getExchangeRate(Currency.USD, Currency.ZAR);

      expect(rate.fromCurrency).toBe(Currency.USD);
      expect(rate.toCurrency).toBe(Currency.ZAR);
      expect(rate.rate).toBeGreaterThan(0);
      expect(rate.timestamp).toBeDefined();
    });

    it('should cache rates', async () => {
      const rate1 = service.getExchangeRate(Currency.EUR, Currency.ZAR);
      const rate2 = service.getExchangeRate(Currency.EUR, Currency.ZAR);

      expect(rate1.timestamp.getTime()).toBe(rate2.timestamp.getTime());
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return all supported currencies', () => {
      const currencies = service.getSupportedCurrencies();

      expect(currencies).toContain(Currency.ZAR);
      expect(currencies).toContain(Currency.USD);
      expect(currencies).toContain(Currency.EUR);
      expect(currencies).toContain(Currency.GBP);
      expect(currencies.length).toBeGreaterThan(5);
    });
  });

  describe('getCurrencyDetails', () => {
    it('should return details for ZAR', () => {
      const details = service.getCurrencyDetails(Currency.ZAR);

      expect(details.code).toBe(Currency.ZAR);
      expect(details.name).toBe('South African Rand');
      expect(details.symbol).toBe('R');
      expect(details.decimalPlaces).toBe(2);
    });

    it('should return details for USD', () => {
      const details = service.getCurrencyDetails(Currency.USD);

      expect(details.name).toBe('US Dollar');
      expect(details.symbol).toBe('$');
    });

    it('should return details for regional currencies', () => {
      const bwp = service.getCurrencyDetails(Currency.BWP);
      expect(bwp.name).toBe('Botswana Pula');

      const nad = service.getCurrencyDetails(Currency.NAD);
      expect(nad.name).toBe('Namibian Dollar');
    });
  });

  describe('formatAmount', () => {
    it('should format ZAR amount correctly', () => {
      expect(service.formatAmount(10050, Currency.ZAR)).toBe('R100.50');
      expect(service.formatAmount(100, Currency.ZAR)).toBe('R1.00');
      expect(service.formatAmount(50, Currency.ZAR)).toBe('R0.50');
    });

    it('should format USD amount correctly', () => {
      expect(service.formatAmount(10050, Currency.USD)).toBe('$100.50');
    });

    it('should format EUR amount correctly', () => {
      expect(service.formatAmount(10050, Currency.EUR)).toBe('\u20AC100.50');
    });

    it('should default to ZAR if no currency specified', () => {
      expect(service.formatAmount(5000)).toBe('R50.00');
    });
  });

  describe('parseCurrencyCode', () => {
    it('should parse standard codes', () => {
      expect(service.parseCurrencyCode('ZAR')).toBe(Currency.ZAR);
      expect(service.parseCurrencyCode('usd')).toBe(Currency.USD);
      expect(service.parseCurrencyCode('EUR')).toBe(Currency.EUR);
    });

    it('should parse aliases', () => {
      expect(service.parseCurrencyCode('RAND')).toBe(Currency.ZAR);
      expect(service.parseCurrencyCode('DOLLAR')).toBe(Currency.USD);
      expect(service.parseCurrencyCode('EURO')).toBe(Currency.EUR);
    });

    it('should handle whitespace', () => {
      expect(service.parseCurrencyCode('  ZAR  ')).toBe(Currency.ZAR);
    });

    it('should throw for invalid codes', () => {
      expect(() => service.parseCurrencyCode('XYZ')).toThrow(
        ValidationException,
      );
      expect(() => service.parseCurrencyCode('')).toThrow(ValidationException);
    });
  });

  describe('isCommonMonetaryArea', () => {
    it('should identify CMA currencies', () => {
      expect(service.isCommonMonetaryArea(Currency.ZAR)).toBe(true);
      expect(service.isCommonMonetaryArea(Currency.NAD)).toBe(true);
      expect(service.isCommonMonetaryArea(Currency.SZL)).toBe(true);
      expect(service.isCommonMonetaryArea(Currency.LSL)).toBe(true);
    });

    it('should return false for non-CMA currencies', () => {
      expect(service.isCommonMonetaryArea(Currency.USD)).toBe(false);
      expect(service.isCommonMonetaryArea(Currency.EUR)).toBe(false);
      expect(service.isCommonMonetaryArea(Currency.BWP)).toBe(false);
    });
  });

  describe('getCacheStats', () => {
    it('should return empty cache initially', () => {
      service.clearCache();
      const stats = service.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.currencies).toEqual([]);
    });

    it('should track cached rates', async () => {
      service.getExchangeRate(Currency.USD, Currency.ZAR);
      service.getExchangeRate(Currency.EUR, Currency.ZAR);

      const stats = service.getCacheStats();

      expect(stats.size).toBe(2);
    });
  });

  describe('cross-currency conversion', () => {
    it('should convert between non-ZAR currencies', async () => {
      const result = await service.convertCurrency(
        10000, // $100.00
        Currency.USD,
        Currency.EUR,
      );

      expect(result.originalCurrency).toBe(Currency.USD);
      expect(result.convertedCurrency).toBe(Currency.EUR);
      expect(result.convertedCents).toBeGreaterThan(0);
    });

    it('should convert between African currencies', async () => {
      const result = await service.convertCurrency(
        10000,
        Currency.BWP, // Botswana Pula
        Currency.ZMW, // Zambian Kwacha
      );

      expect(result.convertedCents).toBeGreaterThan(0);
    });
  });

  describe('rounding behavior', () => {
    it('should round to nearest cent', async () => {
      // Set a rate that would produce fractional cents
      service.setManualRate(Currency.USD, Currency.ZAR, 18.333);

      const result = await service.convertCurrency(
        100,
        Currency.USD,
        Currency.ZAR,
      );

      expect(Number.isInteger(result.convertedCents)).toBe(true);
    });
  });
});
