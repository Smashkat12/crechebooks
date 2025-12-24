/**
 * Accuracy Metrics Service Tests
 * TASK-TRANS-017: Transaction Categorization Accuracy Tracking
 *
 * Tests for accuracy tracking and reporting.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AccuracyMetricsService } from '../accuracy-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricEventType } from '@prisma/client';
import { ACCURACY_CONSTANTS } from '../../dto/accuracy.dto';

describe('AccuracyMetricsService', () => {
  let service: AccuracyMetricsService;
  let mockPrisma: any;

  const tenantId = 'tenant-123';
  const transactionId = 'tx-456';

  beforeEach(async () => {
    mockPrisma = {
      categorizationMetric: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccuracyMetricsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccuracyMetricsService>(AccuracyMetricsService);
  });

  describe('recordCategorization', () => {
    it('should create a CATEGORIZED metric record', async () => {
      mockPrisma.categorizationMetric.create.mockResolvedValue({});

      await service.recordCategorization(tenantId, {
        transactionId,
        confidence: 85,
        isAutoApplied: true,
        accountCode: '5100',
      });

      expect(mockPrisma.categorizationMetric.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          transactionId,
          eventType: MetricEventType.CATEGORIZED,
          confidence: 85,
          isAutoApplied: true,
          originalAccountCode: '5100',
        },
      });
    });

    it('should handle non-auto-applied categorizations', async () => {
      mockPrisma.categorizationMetric.create.mockResolvedValue({});

      await service.recordCategorization(tenantId, {
        transactionId,
        confidence: 100,
        isAutoApplied: false,
        accountCode: '4100',
      });

      expect(mockPrisma.categorizationMetric.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isAutoApplied: false,
          confidence: 100,
        }),
      });
    });
  });

  describe('recordCorrection', () => {
    it('should create a CORRECTED metric record', async () => {
      mockPrisma.categorizationMetric.create.mockResolvedValue({});

      await service.recordCorrection(tenantId, {
        transactionId,
        originalAccountCode: '5100',
        correctedAccountCode: '5200',
      });

      expect(mockPrisma.categorizationMetric.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          transactionId,
          eventType: MetricEventType.CORRECTED,
          confidence: 0,
          isAutoApplied: false,
          originalAccountCode: '5100',
          correctedAccountCode: '5200',
        },
      });
    });
  });

  describe('getAccuracy', () => {
    it('should calculate 100% accuracy when no corrections', async () => {
      const metrics = [
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 85,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 80,
          isAutoApplied: false,
        },
      ];

      mockPrisma.categorizationMetric.findMany.mockResolvedValue(metrics);

      const result = await service.getAccuracy(tenantId);

      expect(result.totalCategorized).toBe(3);
      expect(result.totalCorrected).toBe(0);
      expect(result.accuracyPercentage).toBe(100);
      expect(result.averageConfidence).toBeCloseTo(85, 0);
      expect(result.autoApplyRate).toBeCloseTo(66.67, 0);
    });

    it('should calculate accuracy with corrections', async () => {
      const metrics = [
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 85,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 80,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 75,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CORRECTED,
          confidence: 0,
          isAutoApplied: false,
        },
      ];

      mockPrisma.categorizationMetric.findMany.mockResolvedValue(metrics);

      const result = await service.getAccuracy(tenantId);

      expect(result.totalCategorized).toBe(4);
      expect(result.totalCorrected).toBe(1);
      // (4 - 1) / 4 * 100 = 75%
      expect(result.accuracyPercentage).toBe(75);
    });

    it('should handle empty metrics', async () => {
      mockPrisma.categorizationMetric.findMany.mockResolvedValue([]);

      const result = await service.getAccuracy(tenantId);

      expect(result.totalCategorized).toBe(0);
      expect(result.totalCorrected).toBe(0);
      expect(result.accuracyPercentage).toBe(100);
      expect(result.averageConfidence).toBe(0);
    });

    it('should filter by date range when provided', async () => {
      mockPrisma.categorizationMetric.findMany.mockResolvedValue([]);

      const fromDate = new Date('2024-01-01');
      const toDate = new Date('2024-01-31');

      await service.getAccuracy(tenantId, { fromDate, toDate });

      expect(mockPrisma.categorizationMetric.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          date: {
            gte: fromDate,
            lte: toDate,
          },
        },
      });
    });
  });

  describe('getTrend', () => {
    it('should group metrics by week', async () => {
      const metrics = [
        {
          date: new Date('2024-01-08'),
          eventType: MetricEventType.CATEGORIZED,
        },
        {
          date: new Date('2024-01-09'),
          eventType: MetricEventType.CATEGORIZED,
        },
        {
          date: new Date('2024-01-15'),
          eventType: MetricEventType.CATEGORIZED,
        },
        { date: new Date('2024-01-15'), eventType: MetricEventType.CORRECTED },
      ];

      mockPrisma.categorizationMetric.findMany.mockResolvedValue(metrics);

      const result = await service.getTrend(tenantId, 30);

      expect(result.length).toBe(2);
      // Week 1 (Jan 8-9): 2 categorized, 0 corrected = 100%
      // Week 2 (Jan 15): 1 categorized, 1 corrected = 0%
    });

    it('should return empty array when no metrics', async () => {
      mockPrisma.categorizationMetric.findMany.mockResolvedValue([]);

      const result = await service.getTrend(tenantId, 30);

      expect(result).toEqual([]);
    });
  });

  describe('checkThreshold', () => {
    it('should return above threshold when accuracy >= target', async () => {
      const metrics = [
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
        {
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
        },
      ];

      mockPrisma.categorizationMetric.findMany.mockResolvedValue(metrics);

      const result = await service.checkThreshold(tenantId);

      expect(result.isAboveThreshold).toBe(true);
      expect(result.currentAccuracy).toBe(100);
      expect(result.alertLevel).toBeUndefined();
    });

    it('should return CRITICAL when accuracy below critical threshold', async () => {
      // 20 categorized, 4 corrected = 80% accuracy
      const categorized = Array(20).fill({
        eventType: MetricEventType.CATEGORIZED,
        confidence: 90,
        isAutoApplied: true,
      });
      const corrected = Array(4).fill({
        eventType: MetricEventType.CORRECTED,
        confidence: 0,
        isAutoApplied: false,
      });

      mockPrisma.categorizationMetric.findMany.mockResolvedValue([
        ...categorized,
        ...corrected,
      ]);

      const result = await service.checkThreshold(tenantId);

      expect(result.isAboveThreshold).toBe(false);
      expect(result.currentAccuracy).toBe(80);
      expect(result.alertLevel).toBe('CRITICAL');
    });

    it('should return WARNING when accuracy between warning and target', async () => {
      // 20 categorized, 2 corrected = 90% accuracy
      const categorized = Array(20).fill({
        eventType: MetricEventType.CATEGORIZED,
        confidence: 90,
        isAutoApplied: true,
      });
      const corrected = Array(2).fill({
        eventType: MetricEventType.CORRECTED,
        confidence: 0,
        isAutoApplied: false,
      });

      mockPrisma.categorizationMetric.findMany.mockResolvedValue([
        ...categorized,
        ...corrected,
      ]);

      const result = await service.checkThreshold(tenantId);

      expect(result.isAboveThreshold).toBe(true);
      expect(result.currentAccuracy).toBe(90);
      expect(result.alertLevel).toBe('WARNING');
    });
  });

  describe('getSummaryStats', () => {
    it('should return summary statistics', async () => {
      // 30-day metrics (high accuracy)
      const thirtyDayMetrics = [
        ...Array(100).fill({
          eventType: MetricEventType.CATEGORIZED,
          confidence: 90,
          isAutoApplied: true,
          date: new Date(),
        }),
        ...Array(3).fill({
          eventType: MetricEventType.CORRECTED,
          confidence: 0,
          isAutoApplied: false,
          date: new Date(),
        }),
      ];

      mockPrisma.categorizationMetric.findMany.mockResolvedValue(
        thirtyDayMetrics,
      );

      const result = await service.getSummaryStats(tenantId);

      expect(result.accuracy30Day).toBeDefined();
      expect(result.accuracy7Day).toBeDefined();
      expect(result.trend).toMatch(/IMPROVING|STABLE|DECLINING/);
    });
  });
});
